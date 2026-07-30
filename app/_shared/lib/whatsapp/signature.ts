import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Prisma } from "@prisma/client";
import { db } from "@/app/_shared/lib/prisma";
import { logWhatsAppEvent } from "@/app/_shared/lib/log";
import { gerarProcuracao } from "@/app/_shared/utils/gerarProcuracao";
import {
  createDocFromPdf,
  getDoc,
  downloadSignedPdf,
  isZapSignConfigured,
} from "@/app/_shared/lib/zapsign";
import { sendBotReply, postInternalNote, qualifyToQueue } from "./bot";
import { sendSystemWhatsApp, findOrCreateContactByPhone } from "./outbound";
import { whatsappRecipients } from "./service";

// FLUXO DE PROCURAÇÃO COM ASSINATURA ELETRÔNICA (ZapSign)
//
// Disparado quando a IA QUALIFICA um lead (coleta de documentos encerrada):
//   1. A IA do microserviço EXTRAI os dados do KIT_PREV_CSS da conversa +
//      documentos (RG/CNH por visão): nome, nacionalidade, estado civil,
//      profissão, RG, CPF e endereço completo.
//   2. O código VALIDA campo a campo (obrigatoriedade + confiança mínima +
//      dígito verificador de CPF + formato de CEP). Qualquer pendência →
//      NADA é enviado: nota interna lista o que faltou e o atendente segue
//      manualmente (a conversa já está na fila pela qualificação).
//   3. Dados completos → preenche o -KIT_PREV_CSS.docx (docxtemplater),
//      converte em PDF (docx-converter), guarda cópia no S3, cria o documento
//      na ZapSign e envia o LINK DE ASSINATURA ao cliente pelo WhatsApp.
//   4. O cron (runSignatureReminders) lembra o cliente de assinar (até 3
//      lembretes, horário comercial, janela de 24h/template) e faz polling do
//      status como retaguarda do webhook.
//   5. Assinou (webhook /api/zapsign/webhook ou polling) → PDF assinado vai
//      pro S3, a conversa volta pra FILA com nota "validar contrato" e a
//      equipe é notificada — a validação final é SEMPRE humana.

const CHATBOT_URL = process.env.CHATBOT_URL?.replace(/\/$/, "") ?? "";
const CHATBOT_SECRET = process.env.CHATBOT_SECRET ?? "";
const CONVERTER_URL = process.env.DOCX_CONVERTER_URL || "http://localhost:3001";
const CONVERTER_API_KEY = process.env.CONVERTER_API_KEY || "";

const KIT_TEMPLATE_FILENAME = "-KIT_PREV_CSS.docx";
const EXTRACT_TIMEOUT_MS = 90_000; // visão sobre RG/CNH é pesada

// Lembretes de assinatura: até 3, espaçados de 24h, só em horário comercial.
const SIGN_REMINDER_MAX = 3;
const SIGN_REMINDER_GAP_MS = 24 * 60 * 60_000;
const SIGN_REMINDER_RETRY_MS = 6 * 60 * 60_000; // janela fechada/cooldown → re-tenta
// Template aprovado na Meta para lembrar fora da janela de 24h ({{1}} = nome).
// Enquanto não existir/aprovar, o envio fora da janela é adiado (6h) sem erro.
const SIGN_REMINDER_TEMPLATE = "lembrete_assinatura";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

// ---------------------------------------------------------------------------
// Campos do KIT e validação
// ---------------------------------------------------------------------------

export const CONTRACT_FIELD_KEYS = [
  "name", "nacionalidade", "estado_civil", "profissao", "rg", "cpf",
  "rua", "numero", "bairro", "cep", "cidade", "estado",
] as const;

type ContractFieldKey = (typeof CONTRACT_FIELD_KEYS)[number];

const FIELD_LABELS: Record<ContractFieldKey, string> = {
  name: "nome completo",
  nacionalidade: "nacionalidade",
  estado_civil: "estado civil",
  profissao: "profissão",
  rg: "RG",
  cpf: "CPF",
  rua: "rua",
  numero: "número",
  bairro: "bairro",
  cep: "CEP",
  cidade: "cidade",
  estado: "estado",
};

// Confiança mínima por campo (a IA devolve confidence 0..1 por campo).
// Nome/CPF/RG saem do documento e sustentam o contrato → exigência maior.
const MIN_CONFIDENCE: Record<ContractFieldKey, number> = {
  name: 0.6, nacionalidade: 0.3, estado_civil: 0.5, profissao: 0.5,
  rg: 0.5, cpf: 0.7, rua: 0.5, numero: 0.4, bairro: 0.4, cep: 0.5,
  cidade: 0.5, estado: 0.5,
};

interface ExtractedField {
  value: string;
  confidence: number;
  source: "documento" | "conversa" | "inferido" | "ausente";
}

type ExtractedFields = Record<ContractFieldKey, ExtractedField>;

/** Mesmo algoritmo do microserviço: dígitos verificadores do CPF. */
function isValidCPF(raw: string): boolean {
  const cpf = raw.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(cpf[i]) * (len + 1 - i);
    const digit = ((sum * 10) % 11) % 10;
    if (digit !== Number(cpf[len])) return false;
  }
  return true;
}

interface MissingField {
  key: ContractFieldKey | "confirmacao";
  label: string;
  reason: string;
}

/**
 * Telefone do signatário no formato da ZapSign: DDD + 9 + número.
 * A Meta entrega muitos números SEM o 9º dígito (55 + DDD + 8 dígitos) e a
 * ZapSign exige o celular REAL do cliente (o código de verificação chega
 * nele). DDD+8 dígitos → insere o 9.
 */
export function brMobileWith9(phone: string): string {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("55")) d = d.slice(2);
  if (d.length === 10) d = `${d.slice(0, 2)}9${d.slice(2)}`;
  return d;
}

const UF_NAMES: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
  MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará",
  PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
};

/** Remove acentos e caixa para comparação tolerante (cliente escreve "curitiba"). */
function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Confere o CEP no ViaCEP e ENRIQUECE o endereço (rua/bairro/cidade/estado
 * faltantes vêm do CEP). Devolve pendência quando:
 *   - o CEP não existe na base (típico de região rural / CEP chutado) → o
 *     atendente confirma o endereço com o cliente;
 *   - a cidade extraída não bate com a do CEP (provável dígito errado).
 * ViaCEP fora do ar NÃO trava o fluxo (só loga) — a validação de formato já
 * passou e o atendente valida tudo no final de qualquer jeito.
 */
async function checkAndEnrichCep(fields: ExtractedFields): Promise<MissingField | null> {
  const cep = fields.cep?.value?.replace(/\D/g, "") ?? "";
  if (cep.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string;
    };
    if (data.erro) {
      return {
        key: "cep",
        label: FIELD_LABELS.cep,
        reason: `CEP ${fields.cep.value} não existe na base dos Correios (região rural? dígito trocado?) — confirmar endereço com o cliente`,
      };
    }
    // Cidade do CEP ≠ cidade extraída → provável CEP errado; humano confere.
    if (data.localidade && fields.cidade?.value && norm(data.localidade) !== norm(fields.cidade.value)) {
      return {
        key: "cep",
        label: FIELD_LABELS.cep,
        reason: `CEP pertence a ${data.localidade}/${data.uf}, mas o cliente informou ${fields.cidade.value} — confirmar qual está certo`,
      };
    }
    // Enriquecimento: o que faltou no relato vem do próprio CEP.
    const fill = (key: ContractFieldKey, value?: string) => {
      if (value && (!fields[key]?.value || fields[key].confidence < MIN_CONFIDENCE[key])) {
        fields[key] = { value, confidence: 0.95, source: "inferido" };
      }
    };
    fill("rua", data.logradouro);
    fill("bairro", data.bairro);
    fill("cidade", data.localidade);
    fill("estado", data.uf ? UF_NAMES[data.uf] ?? data.uf : undefined);
  } catch (err) {
    console.warn("[ZAPSIGN] ViaCEP indisponível (seguindo sem a checagem):", err);
  }
  return null;
}

/** Valida a extração campo a campo (incl. ViaCEP); devolve as pendências (vazio = tudo ok). */
async function validateExtraction(fields: ExtractedFields): Promise<MissingField[]> {
  // Estado como sigla ("PR") → nome por extenso, como o template espera.
  const uf = fields.estado?.value?.trim().toUpperCase() ?? "";
  if (UF_NAMES[uf]) fields.estado = { ...fields.estado, value: UF_NAMES[uf] };

  // ViaCEP primeiro: pode PREENCHER rua/bairro/cidade/estado antes da checagem
  // de obrigatoriedade (cliente que só sabe o CEP ainda passa).
  const missing: MissingField[] = [];
  const cepIssue = await checkAndEnrichCep(fields);
  if (cepIssue) missing.push(cepIssue);

  for (const key of CONTRACT_FIELD_KEYS) {
    const f = fields[key];
    if (!f?.value?.trim()) {
      missing.push({ key, label: FIELD_LABELS[key], reason: "não encontrado na conversa/documentos" });
      continue;
    }
    if (f.confidence < MIN_CONFIDENCE[key]) {
      missing.push({ key, label: FIELD_LABELS[key], reason: `leitura com baixa confiança (${Math.round(f.confidence * 100)}%)` });
      continue;
    }
    if (key === "cpf" && !isValidCPF(f.value)) {
      missing.push({ key, label: FIELD_LABELS[key], reason: `dígito verificador inválido (${f.value})` });
    }
    if (key === "cep" && !/^\d{5}-?\d{3}$/.test(f.value.replace(/\s/g, ""))) {
      missing.push({ key, label: FIELD_LABELS[key], reason: `formato inválido (${f.value})` });
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Suporte: mídia da conversa, PDF e S3
// ---------------------------------------------------------------------------

/** Documentos (imagem/PDF) que o CLIENTE enviou — viram blocos de visão na extração. */
async function collectDocumentMedia(contactId: string): Promise<{ url: string; mimeType: string }[]> {
  const msgs = await db.whatsAppMessage.findMany({
    where: {
      contactId,
      direction: "in",
      deletedAt: null,
      mediaKey: { not: null },
      OR: [
        { mediaType: { startsWith: "image/" } },
        { mediaType: { startsWith: "application/pdf" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 6,
    select: { mediaKey: true, mediaType: true },
  });
  const out: { url: string; mimeType: string }[] = [];
  for (const m of msgs) {
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: m.mediaKey! }),
      { expiresIn: 600 },
    );
    out.push({ url, mimeType: m.mediaType! });
  }
  return out;
}

/** Preenche o KIT e converte em PDF no docx-converter. */
async function generateKitPdf(dados: Record<string, string>): Promise<Buffer> {
  const docx = await gerarProcuracao(dados, KIT_TEMPLATE_FILENAME);
  const res = await fetch(`${CONVERTER_URL}/convert`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      ...(CONVERTER_API_KEY && { "x-api-key": CONVERTER_API_KEY }),
    },
    body: new Uint8Array(docx),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new Error(`docx-converter HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Notifica a equipe inteira (sino) — mesmo padrão do handoff do bot. */
async function notifyTeam(contactId: string, contactLabel: string, message: string): Promise<void> {
  try {
    const recipients = await whatsappRecipients();
    for (const id of recipients) {
      await db.notification.create({
        data: {
          recipientId: id,
          authorId: "whatsapp-bot",
          authorName: "🖊️ Assinatura (ZapSign)",
          targetName: contactLabel,
          message,
          contactId,
        },
      });
    }
  } catch (err) {
    console.error("[ZAPSIGN] Falha ao notificar equipe:", err);
  }
}

// ---------------------------------------------------------------------------
// Extração via microserviço da IA
// ---------------------------------------------------------------------------

async function callExtract(contactId: string, contact: { name: string | null; phone: string }): Promise<{
  fields: ExtractedFields;
  documentsRead: number;
}> {
  const [historyRows, conversation, documents] = await Promise.all([
    db.whatsAppMessage.findMany({
      where: { contactId, internal: false, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 40,
      select: { direction: true, sentByBot: true, body: true },
    }),
    db.whatsAppConversation.findUnique({
      where: { contactId },
      select: { botMemory: true },
    }),
    collectDocumentMedia(contactId),
  ]);

  const res = await fetch(`${CHATBOT_URL}/extract-contract-data`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-bot-secret": CHATBOT_SECRET },
    body: JSON.stringify({
      contact: { name: contact.name, phone: contact.phone },
      memory: conversation?.botMemory ?? null,
      history: historyRows
        .reverse()
        .filter((h) => h.body)
        .map((h) => ({ role: h.direction === "in" ? "client" : h.sentByBot ? "bot" : "agent", text: h.body })),
      documents,
    }),
    signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`extract-contract-data HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.fields) throw new Error("extração sem campo fields");
  return { fields: data.fields as ExtractedFields, documentsRead: Number(data.documentsRead ?? 0) };
}

// ---------------------------------------------------------------------------
// Fluxo principal
// ---------------------------------------------------------------------------

/** Monta o dicionário do docxtemplater a partir dos campos extraídos. */
function buildDados(fields: ExtractedFields): Record<string, string> {
  const dados: Record<string, string> = { data: new Date().toLocaleDateString("pt-BR") };
  for (const key of CONTRACT_FIELD_KEYS) dados[key] = fields[key].value;
  return dados;
}

/**
 * Resumo dos dados em linguagem SIMPLES (o público inclui gente que mal lê):
 * um dado por linha, com emoji de apoio, e instrução binária no final.
 */
function summaryMessage(dados: Record<string, string>): string {
  return [
    "Antes de eu te mandar o documento pra assinar, confere comigo se está tudo certinho? 📋",
    "",
    `👤 Nome: ${dados.name}`,
    `🪪 RG: ${dados.rg}`,
    `🪪 CPF: ${dados.cpf}`,
    `💍 Estado civil: ${dados.estado_civil}`,
    `💼 Profissão: ${dados.profissao}`,
    `🏠 Endereço: ${dados.rua}, nº ${dados.numero}, ${dados.bairro}`,
    `📮 CEP: ${dados.cep} — ${dados.cidade}/${dados.estado}`,
    "",
    "Se estiver tudo certo, responde *SIM* pra mim. Se tiver alguma coisa errada, me fala qual que eu corrijo, tá bom? 😊",
  ].join("\n");
}

/**
 * Gera o PDF do KIT, cria o documento na ZapSign e envia o link ao cliente.
 * Usada nas DUAS portas: fluxo do bot (após o cliente confirmar o resumo) e
 * botão manual do card (sem envio automático de mensagens quando sendMessages=false).
 */
async function issueSignature(
  requestId: string,
  contactId: string,
  contact: { phone: string; name: string | null },
  fields: ExtractedFields,
  opts: { sendMessages: boolean },
): Promise<{ signUrl: string; docToken: string }> {
  const dados = buildDados(fields);

  // Status muda ANTES da criação: se a função morrer no meio, a faxina do cron
  // (aguardando sem docToken há 15min+) marca erro e avisa a equipe.
  await db.whatsAppSignatureRequest.update({
    where: { id: requestId },
    data: { status: "aguardando", extracted: fields as unknown as Prisma.InputJsonValue },
  });

  const pdf = await generateKitPdf(dados);
  const pdfKey = `whatsapp/${contactId}/procuracao-kit-${Date.now()}.pdf`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: pdfKey,
    Body: pdf,
    ContentType: "application/pdf",
  }));

  const doc = await createDocFromPdf({
    name: `Procuração e Contrato — ${dados.name}`,
    base64Pdf: pdf.toString("base64"),
    externalId: requestId,
    folderPath: "/whatsapp-bot/",
    signer: {
      name: dados.name,
      // ZapSign exige o CELULAR REAL (código de verificação chega nele) — a
      // Meta costuma entregar o número SEM o 9º dígito; o helper insere.
      phoneNumber: brMobileWith9(contact.phone),
      phoneCountry: "55",
    },
  });
  const signer = doc.signers?.[0];
  if (!signer?.sign_url) throw new Error("ZapSign não devolveu sign_url");

  await db.whatsAppSignatureRequest.update({
    where: { id: requestId },
    data: {
      docToken: doc.token,
      signerToken: signer.token,
      signUrl: signer.sign_url,
      pdfKey,
      sentAt: new Date(),
      nextReminderAt: new Date(Date.now() + SIGN_REMINDER_GAP_MS),
    },
  });

  // Ficha do contato ganha os dados (pré-preenche o "Adicionar cliente").
  try {
    const existingContact = await db.whatsAppContact.findUnique({
      where: { id: contactId },
      select: { clientDraft: true },
    });
    const draft = (existingContact?.clientDraft as Record<string, unknown> | null) ?? {};
    await db.whatsAppContact.update({
      where: { id: contactId },
      data: {
        clientDraft: {
          ...draft,
          ...Object.fromEntries(CONTRACT_FIELD_KEYS.map((k) => [k, fields[k].value])),
        } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error("[ZAPSIGN] Falha ao atualizar clientDraft (seguindo):", err);
  }

  if (opts.sendMessages) {
    const first = (dados.name || "").split(/\s+/)[0] ?? "";
    await sendBotReply(
      contactId, contact.phone, contact.name,
      `Perfeito${first ? `, ${first}` : ""}! ✅ Preparei sua procuração e o contrato. É só assinar direto pelo celular, no link abaixo — leva menos de 1 minuto. 😊`,
      1500,
    );
    await sendBotReply(contactId, contact.phone, contact.name, signer.sign_url, 1200);
    await sendBotReply(
      contactId, contact.phone, contact.name,
      "Qualquer dúvida sobre o documento, é só me chamar por aqui, tá bom?",
      1500,
    );
  }

  await postInternalNote(
    contactId,
    `🖊️ Procuração + contrato (KIT) enviados para ASSINATURA ELETRÔNICA (ZapSign).\n` +
    `Quando o cliente assinar, a conversa volta pra fila para VALIDAÇÃO humana.\n` +
    `Link de assinatura: ${signer.sign_url}`,
  );
  await logWhatsAppEvent({
    action: "wa_signature",
    message: "assinatura: documento criado na ZapSign",
    authorId: "whatsapp-bot",
    authorName: "🖊️ Assinatura (ZapSign)",
    contactId,
    contactName: contact.name,
    contactPhone: contact.phone,
    metadata: { stage: "enviado", docToken: doc.token, requestId },
  });
  return { signUrl: signer.sign_url, docToken: doc.token };
}

/** Pendências → nota interna + notificação (o atendente segue manualmente). */
async function failToHuman(
  contactId: string,
  contact: { phone: string; name: string | null },
  fields: ExtractedFields | null,
  missing: MissingField[],
  contexto: string,
  requestId?: string,
): Promise<void> {
  const contactLabel = contact.name ?? `+${contact.phone}`;
  const data = {
    status: "extracao_falhou",
    extracted: (fields ?? undefined) as unknown as Prisma.InputJsonValue,
    missingFields: missing as unknown as Prisma.InputJsonValue,
    nextReminderAt: null,
  };
  if (requestId) {
    await db.whatsAppSignatureRequest.update({ where: { id: requestId }, data });
  } else {
    await db.whatsAppSignatureRequest.create({ data: { contactId, ...data } });
  }
  const lista = missing.map((m) => `• ${m.label}: ${m.reason}`).join("\n");
  await postInternalNote(
    contactId,
    `🖊️ Procuração automática NÃO enviada — ${contexto}.\nPendências:\n${lista}\n\n` +
    `➡️ Confirme os dados com o cliente e gere a procuração pelo botão "Gerar Procuração ZapSign" do card.`,
  );
  await notifyTeam(contactId, contactLabel, `Procuração de ${contactLabel} precisa de revisão manual (${missing.length} pendência(s)).`);
  await logWhatsAppEvent({
    action: "wa_signature",
    message: `assinatura: pendências → revisão humana (${missing.map((m) => m.label).join(", ")})`,
    authorId: "whatsapp-bot",
    authorName: "🖊️ Assinatura (ZapSign)",
    contactId,
    contactName: contact.name,
    contactPhone: contact.phone,
    metadata: { stage: "revisao_humana", missing: missing.map((m) => m.key) },
  });
}

/**
 * Inicia o fluxo de assinatura logo após a QUALIFICAÇÃO do lead.
 * Devolve "confirming" quando os dados fecharam e o bot pediu a CONFIRMAÇÃO ao
 * cliente (a conversa fica em modo bot; a fila acontece depois) — qualquer
 * outro desfecho devolve "queue" (o chamador enfileira como sempre).
 * NUNCA lança: falha vira nota interna + notificação.
 */
export async function maybeStartSignatureFlow(
  contactId: string,
  contact: { phone: string; name: string | null },
): Promise<"confirming" | "queue"> {
  const contactLabel = contact.name ?? `+${contact.phone}`;
  try {
    if (!isZapSignConfigured()) return "queue"; // integração desligada: fluxo antigo segue igual
    if (!CHATBOT_URL || !CHATBOT_SECRET) return "queue";

    // Já existe um ciclo ativo pra este contato? Não duplica documento.
    const active = await db.whatsAppSignatureRequest.findFirst({
      where: { contactId, status: { in: ["confirmando", "aguardando", "visualizado", "assinado"] } },
      select: { id: true, status: true },
    });
    if (active) {
      console.log(`[ZAPSIGN] ${contactId}: já existe ciclo de assinatura ${active.status} — não recria.`);
      return "queue";
    }

    // 1. Extração pela IA (conversa + ficha + RG/CNH por visão).
    const { fields, documentsRead } = await callExtract(contactId, contact);

    // 2. Validação em código (obrigatoriedade, CPF, CEP no ViaCEP).
    const missing = await validateExtraction(fields);
    if (missing.length) {
      await failToHuman(
        contactId, contact, fields, missing,
        `a IA não fechou todos os dados do KIT (${documentsRead} documento(s) lidos)`,
      );
      return "queue";
    }

    // 3. Dados fechados → pede a CONFIRMAÇÃO do cliente antes de gerar o doc
    //    (público simples: melhor conferir junto do que assinar dado errado).
    //    A conversa fica em modo bot; a resposta cai em handleConfirmationReply.
    const request = await db.whatsAppSignatureRequest.create({
      data: {
        contactId,
        status: "confirmando",
        extracted: fields as unknown as Prisma.InputJsonValue,
      },
    });

    const dados = buildDados(fields);
    await sendBotReply(contactId, contact.phone, contact.name, summaryMessage(dados), 1500);

    await postInternalNote(
      contactId,
      `🖊️ Dados do KIT extraídos pela IA (${documentsRead} documento(s) lidos). ` +
      `Resumo enviado ao cliente para CONFIRMAÇÃO — após o "sim", a procuração vai pra assinatura na ZapSign.`,
    );
    await logWhatsAppEvent({
      action: "wa_signature",
      message: "assinatura: resumo dos dados enviado para confirmação do cliente",
      authorId: "whatsapp-bot",
      authorName: "🖊️ Assinatura (ZapSign)",
      contactId,
      contactName: contact.name,
      contactPhone: contact.phone,
      metadata: { stage: "confirmando", requestId: request.id, documentsRead },
    });
    return "confirming";
  } catch (err) {
    console.error("[ZAPSIGN] Falha no fluxo de assinatura:", contactId, err);
    // Registra o erro no ciclo (se já criado) e devolve pro humano.
    await db.whatsAppSignatureRequest.updateMany({
      where: { contactId, status: { in: ["confirmando", "aguardando"] }, docToken: null },
      data: { status: "erro", error: String(err instanceof Error ? err.message : err).slice(0, 500) },
    }).catch(() => {});
    await postInternalNote(
      contactId,
      `🖊️ Procuração automática FALHOU (${err instanceof Error ? err.message : String(err)}). ` +
      `➡️ Gere e envie pelo botão "Gerar Procuração ZapSign" do card.`,
    ).catch(() => {});
    await notifyTeam(contactId, contactLabel, `Falha técnica ao gerar procuração de ${contactLabel} — seguir manualmente.`);
    return "queue";
  }
}

// ---------------------------------------------------------------------------
// Geração MANUAL a partir do card (botão "Gerar Procuração ZapSign")
// ---------------------------------------------------------------------------

export interface ManualSignatureResult {
  ok: boolean;
  signUrl?: string;
  error?: string;
  missing?: { label: string; reason: string }[];
}

/**
 * Gera a procuração na ZapSign com os DADOS DO CARD (User/Process) e devolve o
 * link de assinatura pro atendente. Passa pelas MESMAS validações do fluxo
 * automático (obrigatoriedade, CPF, CEP no ViaCEP com enriquecimento) — dado
 * faltando volta a lista de pendências em vez de gerar documento errado.
 * Cria o mesmo ciclo de acompanhamento (webhook + lembretes + validação).
 */
export async function createSignatureFromCard(cardId: string, isProcess: boolean): Promise<ManualSignatureResult> {
  if (!isZapSignConfigured()) return { ok: false, error: "ZAPSIGN_API_TOKEN não configurado no ambiente." };

  const card = isProcess
    ? await db.process.findUnique({ where: { id: cardId } })
    : await db.user.findUnique({ where: { id: cardId } });
  if (!card) return { ok: false, error: "Card não encontrado." };

  const phone = card.telefone || card.telefone_secundario;
  if (!phone) return { ok: false, error: "O card não tem telefone — a ZapSign exige o celular do cliente." };

  const fields = {} as ExtractedFields;
  const fromCard: Record<ContractFieldKey, string | null | undefined> = {
    name: card.name,
    nacionalidade: card.nacionalidade || "brasileiro(a)",
    estado_civil: card.estado_civil,
    profissao: card.profissao,
    rg: card.rg,
    cpf: card.cpf,
    rua: card.rua,
    numero: card.numero,
    bairro: card.bairro,
    cep: card.cep,
    cidade: card.cidade,
    estado: card.estado,
  };
  for (const key of CONTRACT_FIELD_KEYS) {
    fields[key] = { value: (fromCard[key] ?? "").trim(), confidence: 1, source: "conversa" };
  }

  const missing = await validateExtraction(fields);
  if (missing.length) {
    return {
      ok: false,
      error: "Complete os dados do card antes de gerar:",
      missing: missing.map((m) => ({ label: m.label, reason: m.reason })),
    };
  }

  const contact = await findOrCreateContactByPhone(phone, card.name);
  if (!contact) return { ok: false, error: `Telefone do card inválido (${phone}).` };

  const active = await db.whatsAppSignatureRequest.findFirst({
    where: { contactId: contact.id, status: { in: ["confirmando", "aguardando", "visualizado", "assinado"] } },
    select: { status: true, signUrl: true },
  });
  if (active) {
    return {
      ok: active.status !== "assinado" && !!active.signUrl,
      signUrl: active.signUrl ?? undefined,
      error: `Já existe um ciclo de assinatura "${active.status}" para este cliente${active.signUrl ? " — link atual abaixo" : ""}.`,
    };
  }

  try {
    const request = await db.whatsAppSignatureRequest.create({
      data: {
        contactId: contact.id,
        status: "aguardando",
        extracted: fields as unknown as Prisma.InputJsonValue,
      },
    });
    // sendMessages=false: quem decide como entregar o link é o atendente (o
    // ciclo de lembretes/webhook segue funcionando normalmente por trás).
    const { signUrl } = await issueSignature(
      request.id, contact.id,
      { phone: contact.phone, name: contact.name ?? card.name },
      fields,
      { sendMessages: false },
    );
    return { ok: true, signUrl };
  } catch (err) {
    console.error("[ZAPSIGN] Falha na geração manual:", cardId, err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Resposta do cliente à CONFIRMAÇÃO dos dados
// ---------------------------------------------------------------------------

const CONFIRM_MAX_ROUNDS = 2;

/**
 * Intercepta a mensagem do cliente quando há um ciclo em "confirmando".
 * Devolve true quando a mensagem foi tratada aqui (o cérebro normal NÃO roda).
 *
 * Decisões (classificador tolerante do microserviço — aceita "ta serto", 👍 e
 * áudio): confirmado → gera e envia o doc + fila silenciosa; corrigir →
 * aplica, revalida e reenvia o resumo; não sabe o dado / pediu pessoa / 2
 * rodadas sem entender → atendente com os dados anotados.
 */
export async function handleConfirmationReply(
  contactId: string,
  contact: { phone: string; name: string | null },
  clientText: string,
  media: { url: string; mimeType: string } | null,
): Promise<boolean> {
  const request = await db.whatsAppSignatureRequest.findFirst({
    where: { contactId, status: "confirmando" },
    orderBy: { createdAt: "desc" },
  });
  if (!request) return false;

  const contactLabel = contact.name ?? `+${contact.phone}`;
  const fields = request.extracted as unknown as ExtractedFields;

  try {
    const res = await fetch(`${CHATBOT_URL}/confirm-contract-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bot-secret": CHATBOT_SECRET },
      body: JSON.stringify({
        contact: { name: contact.name, phone: contact.phone },
        extracted: fields,
        message: clientText,
        media,
      }),
      signal: AbortSignal.timeout(45_000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`confirm-contract-data HTTP ${res.status}`);
    const out = (await res.json()) as {
      decision: "confirmado" | "corrigir" | "atendente" | "nao_entendi";
      corrections: { field: ContractFieldKey; value: string }[];
      reply: string;
    };

    if (out.decision === "confirmado") {
      await issueSignature(request.id, contactId, contact, fields, { sendMessages: true });
      // Agora sim o lead entra na fila como qualificado (notificação + Meta) —
      // e em seguida o SLA é silenciado: quem dita o ritmo é o ciclo de
      // lembretes de assinatura, não o alarme de fila.
      await qualifyToQueue(contactId, contactLabel, "dados confirmados pelo cliente + procuração enviada para assinatura (ZapSign)");
      await db.whatsAppConversation.update({
        where: { contactId },
        data: { queuedAt: null, queueAlertAt: null },
      }).catch(() => {});
      return true;
    }

    if (out.decision === "corrigir" && out.corrections.length) {
      for (const c of out.corrections) {
        if ((CONTRACT_FIELD_KEYS as readonly string[]).includes(c.field)) {
          fields[c.field] = { value: c.value.trim(), confidence: 1, source: "conversa" };
        }
      }
      const missing = await validateExtraction(fields);
      const rounds = request.confirmRounds + 1;
      if (missing.length || rounds > CONFIRM_MAX_ROUNDS) {
        await sendBotReply(
          contactId, contact.phone, contact.name,
          "Anotei! Vou pedir pra um dos nossos atendentes conferir tudo certinho com você antes de gerar o documento, tá bom? Já já alguém te chama por aqui. 😊",
          1500,
        ).catch(() => {});
        await failToHuman(
          contactId, contact, fields,
          missing.length ? missing : [{ key: "confirmacao", label: "confirmação", reason: `cliente corrigiu dados ${rounds}x — conferir manualmente` }],
          "o cliente corrigiu dados na confirmação e restaram pendências",
          request.id,
        );
        await qualifyToQueue(contactId, contactLabel, "confirmação da procuração precisa de atendente (correções pendentes)");
        return true;
      }
      await db.whatsAppSignatureRequest.update({
        where: { id: request.id },
        data: { extracted: fields as unknown as Prisma.InputJsonValue, confirmRounds: rounds },
      });
      const intro = out.reply || "Corrigi aqui! Dá uma olhada de novo, por favor:";
      await sendBotReply(contactId, contact.phone, contact.name, intro, 1200);
      await sendBotReply(contactId, contact.phone, contact.name, summaryMessage(buildDados(fields)), 1500);
      return true;
    }

    if (out.decision === "nao_entendi" && request.confirmRounds < CONFIRM_MAX_ROUNDS) {
      await db.whatsAppSignatureRequest.update({
        where: { id: request.id },
        data: { confirmRounds: request.confirmRounds + 1 },
      });
      await sendBotReply(
        contactId, contact.phone, contact.name,
        out.reply || "Só pra confirmar: os dados que te mandei ali em cima estão certinhos? Pode responder só *SIM*, ou me falar o que está errado. 😊",
        1500,
      );
      return true;
    }

    // atendente (pediu pessoa / não sabe o dado / não consegue) ou esgotou as
    // rodadas de "não entendi" → humano assume com tudo anotado.
    await sendBotReply(
      contactId, contact.phone, contact.name,
      "Sem problema! Vou pedir pra um dos nossos atendentes conferir esses dados com você com calma, tá bom? Já já alguém te chama por aqui. 😊",
      1500,
    ).catch(() => {});
    await failToHuman(
      contactId, contact, fields,
      [{ key: "confirmacao", label: "confirmação", reason: out.decision === "atendente" ? "cliente não sabe/não confirmou os dados (pediu ajuda)" : "cliente não entendeu o pedido de confirmação (2 tentativas)" }],
      "a confirmação dos dados precisou de um atendente",
      request.id,
    );
    await qualifyToQueue(contactId, contactLabel, "confirmação da procuração precisa de atendente");
    return true;
  } catch (err) {
    console.error("[ZAPSIGN] Falha na confirmação de dados:", contactId, err);
    await failToHuman(
      contactId, contact, fields,
      [{ key: "confirmacao", label: "confirmação", reason: `falha técnica na confirmação (${err instanceof Error ? err.message : String(err)})` }],
      "falha técnica na etapa de confirmação",
      request.id,
    ).catch(() => {});
    await qualifyToQueue(contactId, contactLabel, "falha técnica na confirmação da procuração").catch(() => {});
    return true;
  }
}

// ---------------------------------------------------------------------------
// Assinado (webhook da ZapSign ou polling do cron)
// ---------------------------------------------------------------------------

/**
 * Consolida um documento ASSINADO: PDF assinado no S3, conversa de volta à
 * fila com prioridade e nota de validação pra equipe. Idempotente — webhook e
 * polling podem chegar juntos.
 */
export async function processSignedDoc(docToken: string): Promise<boolean> {
  const request = await db.whatsAppSignatureRequest.findUnique({
    where: { docToken },
    include: { contact: true },
  });
  if (!request) {
    console.warn(`[ZAPSIGN] webhook de doc desconhecido: ${docToken}`);
    return false;
  }
  if (request.status === "assinado" || request.status === "validado") return true; // já processado

  // Fonte da verdade: a API (nunca confiar só no payload do webhook).
  const doc = await getDoc(docToken);
  if (doc.status !== "signed") {
    console.log(`[ZAPSIGN] ${docToken}: status na API é "${doc.status}" — nada a fazer.`);
    return false;
  }

  let signedPdfKey: string | null = null;
  try {
    const signedPdf = await downloadSignedPdf(doc);
    if (signedPdf) {
      signedPdfKey = `whatsapp/${request.contactId}/procuracao-assinada-${Date.now()}.pdf`;
      await s3.send(new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: signedPdfKey,
        Body: signedPdf,
        ContentType: "application/pdf",
      }));
      // Anexa também na ficha de documentos do contato (migra pro card no
      // "Adicionar cliente").
      const contactRow = await db.whatsAppContact.findUnique({
        where: { id: request.contactId },
        select: { draftDocuments: true },
      });
      const docs = Array.isArray(contactRow?.draftDocuments) ? (contactRow!.draftDocuments as unknown[]) : [];
      await db.whatsAppContact.update({
        where: { id: request.contactId },
        data: {
          draftDocuments: [
            ...docs,
            { key: signedPdfKey, name: "Procuração assinada (ZapSign).pdf", uploadedAt: new Date().toISOString() },
          ] as unknown as Prisma.InputJsonValue,
        },
      });
    }
  } catch (err) {
    console.error("[ZAPSIGN] Falha ao salvar PDF assinado (seguindo mesmo assim):", err);
  }

  await db.whatsAppSignatureRequest.update({
    where: { id: request.id },
    data: { status: "assinado", signedAt: new Date(), signedPdfKey, nextReminderAt: null },
  });

  // Conversa volta pra FILA com o SLA reativado — MAS sem roubar o ticket de
  // um atendente que já esteja com a conversa (status "human" com dono).
  try {
    const conv = await db.whatsAppConversation.findUnique({
      where: { contactId: request.contactId },
      select: { status: true, assignedToId: true },
    });
    if (conv?.status === "human" && conv.assignedToId) {
      await db.whatsAppConversation.update({
        where: { contactId: request.contactId },
        data: { qualified: true },
      });
    } else {
      await db.whatsAppConversation.update({
        where: { contactId: request.contactId },
        data: { status: "queued", assignedToId: null, qualified: true, queuedAt: new Date(), queueAlertAt: null },
      });
    }
  } catch (err) {
    console.error("[ZAPSIGN] Falha ao reencaminhar conversa pós-assinatura:", err);
  }

  const label = request.contact.name ?? `+${request.contact.phone}`;
  await postInternalNote(
    request.contactId,
    `✅ PROCURAÇÃO ASSINADA pelo cliente (ZapSign).\n` +
    `➡️ VALIDAR: confira os dados extraídos, o documento assinado (salvo na ficha) e dê sequência no contrato.`,
  );
  await notifyTeam(request.contactId, label, `✅ ${label} ASSINOU a procuração — validar o contrato agora.`);
  await logWhatsAppEvent({
    action: "wa_signature",
    message: "assinatura: documento assinado pelo cliente",
    authorId: "whatsapp-bot",
    authorName: "🖊️ Assinatura (ZapSign)",
    contactId: request.contactId,
    contactName: request.contact.name,
    contactPhone: request.contact.phone,
    metadata: { stage: "assinado", docToken, requestId: request.id },
  });

  // Confirmação pro cliente — best-effort (fora da janela de 24h a Meta
  // recusa texto livre; não é crítico).
  try {
    await sendBotReply(
      request.contactId, request.contact.phone, request.contact.name,
      "Recebemos sua assinatura! ✅ Nossa equipe vai conferir tudo e já te dá um retorno por aqui. Obrigado!",
      1200,
    );
  } catch (err) {
    console.warn("[ZAPSIGN] Confirmação pós-assinatura não entregue (ok):", err);
  }
  return true;
}

/** Cliente recusou/cancelou na ZapSign → fila humana com contexto. */
export async function processRefusedDoc(docToken: string): Promise<void> {
  const request = await db.whatsAppSignatureRequest.findUnique({
    where: { docToken },
    include: { contact: true },
  });
  if (!request || ["recusado", "assinado", "validado"].includes(request.status)) return;
  await db.whatsAppSignatureRequest.update({
    where: { id: request.id },
    data: { status: "recusado", nextReminderAt: null },
  });
  await db.whatsAppConversation.update({
    where: { contactId: request.contactId },
    data: { status: "queued", assignedToId: null, queuedAt: new Date(), queueAlertAt: null },
  }).catch(() => {});
  const label = request.contact.name ?? `+${request.contact.phone}`;
  await postInternalNote(
    request.contactId,
    "⚠️ O cliente RECUSOU a assinatura na ZapSign. ➡️ Entrar em contato para entender o motivo.",
  );
  await notifyTeam(request.contactId, label, `⚠️ ${label} recusou a assinatura da procuração — contato manual.`);
}

/** Cliente abriu o link (webhook doc_viewed / signer link-opened). */
export async function markDocViewed(docToken: string): Promise<void> {
  await db.whatsAppSignatureRequest.updateMany({
    where: { docToken, status: "aguardando" },
    data: { status: "visualizado", viewedAt: new Date() },
  });
}

// ---------------------------------------------------------------------------
// Lembretes + polling (chamado pelo cron de 15min)
// ---------------------------------------------------------------------------

// Horário comercial BRT (7h–21h) — mesma régua do ciclo de recuperação.
const BRT_OFFSET_MS = -3 * 60 * 60_000;
function nextBusinessSlot(ts: number): Date {
  const wall = new Date(ts + BRT_OFFSET_MS);
  const h = wall.getUTCHours();
  if (h >= 7 && h < 21) return new Date(ts);
  const dayStart = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  const addDays = h < 7 ? 0 : 1;
  return new Date(dayStart + addDays * 24 * 60 * 60_000 + 7 * 60 * 60_000 - BRT_OFFSET_MS);
}

const REMINDER_TEXTS = [
  (first: string, url: string) =>
    `Oi${first ? `, ${first}` : ""}! Vi que sua procuração ainda está esperando sua assinatura. É rapidinho, direto pelo celular: ${url} 😊`,
  (first: string, url: string) =>
    `${first ? `${first}, f` : "F"}alta só a sua assinatura pra gente dar andamento no seu caso! Assina aqui quando puder: ${url} 🙏`,
  (first: string, url: string) =>
    `${first ? `${first}, e` : "E"}ssa é minha última lembrança, tá? Sem a assinatura a gente não consegue dar entrada no seu benefício — e falta só esse passo. ${url}`,
];

/**
 * Roda no cron: lembra quem não assinou (até 3x) e faz POLLING do status na
 * ZapSign como retaguarda do webhook. Devolve contadores pro log do cron.
 */
export async function runSignatureReminders(now: number): Promise<{ reminders: number; signedByPolling: number; exhausted: number; errors: number }> {
  const results = { reminders: 0, signedByPolling: 0, exhausted: 0, errors: 0 };
  if (!isZapSignConfigured()) return results;

  // Faxina: ciclo que morreu no MEIO da criação (função serverless morta antes
  // do docToken existir) fica como "aguardando" órfão — 15min+ sem docToken →
  // vira "erro" com nota, pro atendente não achar que há assinatura em curso.
  const orphans = await db.whatsAppSignatureRequest.findMany({
    where: {
      status: "aguardando",
      docToken: null,
      createdAt: { lte: new Date(now - 15 * 60_000) },
    },
    take: 10,
  });
  for (const o of orphans) {
    await db.whatsAppSignatureRequest.update({
      where: { id: o.id },
      data: { status: "erro", error: "criação interrompida (sem docToken) — limpo pelo cron" },
    });
    await postInternalNote(
      o.contactId,
      "🖊️ A geração automática da procuração foi interrompida no meio (falha técnica). ➡️ Gerar e enviar manualmente.",
    ).catch(() => {});
  }

  // Confirmação abandonada: cliente recebeu o resumo e sumiu por 12h+ → o
  // atendente assume (o lead é qualificado; não pode apodrecer esperando SIM).
  const staleConfirm = await db.whatsAppSignatureRequest.findMany({
    where: { status: "confirmando", updatedAt: { lte: new Date(now - 12 * 60 * 60_000) } },
    include: { contact: true },
    take: 10,
  });
  for (const req of staleConfirm) {
    try {
      const label = req.contact.name ?? `+${req.contact.phone}`;
      await db.whatsAppSignatureRequest.update({
        where: { id: req.id },
        data: { status: "confirmacao_expirada" },
      });
      await postInternalNote(
        req.contactId,
        "⏰ Cliente não respondeu à confirmação dos dados da procuração (12h). ➡️ Conferir os dados com ele e gerar pelo botão do card.",
      );
      await qualifyToQueue(req.contactId, label, "confirmação da procuração sem resposta (12h) — atendente assume");
      results.exhausted++;
    } catch (err) {
      console.error("[ZAPSIGN] Falha na expiração de confirmação:", req.id, err);
      results.errors++;
    }
  }

  const due = await db.whatsAppSignatureRequest.findMany({
    where: {
      status: { in: ["aguardando", "visualizado"] },
      docToken: { not: null },
      nextReminderAt: { not: null, lte: new Date(now) },
    },
    include: { contact: true },
    take: 15,
  });

  for (const req of due) {
    try {
      // Retaguarda do webhook: consulta o status real antes de lembrar.
      const doc = await getDoc(req.docToken!);
      if (doc.status === "signed") {
        await processSignedDoc(req.docToken!);
        results.signedByPolling++;
        continue;
      }
      if (doc.status === "refused") {
        await processRefusedDoc(req.docToken!);
        continue;
      }
      const signerStatus = doc.signers?.[0]?.status ?? "";
      if (signerStatus === "link-opened" && req.status === "aguardando") {
        await markDocViewed(req.docToken!);
      }

      // Fora do horário comercial → adia sem gastar lembrete.
      const slot = nextBusinessSlot(now);
      if (slot.getTime() > now) {
        await db.whatsAppSignatureRequest.update({ where: { id: req.id }, data: { nextReminderAt: slot } });
        continue;
      }

      // Lembretes esgotados OU ciclo velho demais (7 dias sem assinar — cobre
      // o caso de janela sempre fechada + template lembrete_assinatura ainda
      // não aprovado na Meta, que reagendaria de 6h em 6h pra sempre) →
      // equipe assume o resgate manual.
      const tooOld = req.sentAt && now - req.sentAt.getTime() > 7 * 24 * 60 * 60_000;
      if (req.remindersSent >= SIGN_REMINDER_MAX || tooOld) {
        await db.whatsAppSignatureRequest.update({
          where: { id: req.id },
          data: { nextReminderAt: null },
        });
        await db.whatsAppConversation.update({
          where: { contactId: req.contactId },
          data: { status: "queued", assignedToId: null, queuedAt: new Date(), queueAlertAt: null },
        }).catch(() => {});
        const label = req.contact.name ?? `+${req.contact.phone}`;
        await postInternalNote(
          req.contactId,
          `⏰ Cliente não assinou a procuração após ${SIGN_REMINDER_MAX} lembretes. ➡️ Tentar contato manual (ligação?). Link: ${req.signUrl ?? "—"}`,
        );
        await notifyTeam(req.contactId, label, `⏰ ${label} não assinou a procuração após ${SIGN_REMINDER_MAX} lembretes — resgate manual.`);
        results.exhausted++;
        continue;
      }

      const attempt = req.remindersSent + 1;
      const first = (req.contact.name ?? "").trim().split(/\s+/)[0] ?? "";
      const text = REMINDER_TEXTS[Math.min(attempt, REMINDER_TEXTS.length) - 1](first, req.signUrl ?? "");
      const sent = await sendSystemWhatsApp({
        phone: req.contact.phone,
        clientName: req.contact.name,
        text,
        templateName: SIGN_REMINDER_TEMPLATE,
        templateVars: [first || "tudo bem"],
        authorId: "whatsapp-bot",
        authorName: "🖊️ Assinatura (ZapSign)",
        source: "signature_reminder",
      });
      if (sent.sent) {
        await db.whatsAppSignatureRequest.update({
          where: { id: req.id },
          data: {
            remindersSent: attempt,
            nextReminderAt: nextBusinessSlot(now + SIGN_REMINDER_GAP_MS),
          },
        });
        results.reminders++;
      } else {
        // Janela fechada sem template aprovado / cooldown / opt-out → re-tenta
        // em 6h sem gastar tentativa (o motivo fica no log do outbound).
        await db.whatsAppSignatureRequest.update({
          where: { id: req.id },
          data: { nextReminderAt: nextBusinessSlot(now + SIGN_REMINDER_RETRY_MS) },
        });
      }
    } catch (err) {
      console.error("[ZAPSIGN] Falha no lembrete de assinatura:", req.id, err);
      results.errors++;
    }
  }
  return results;
}

import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Prisma } from "@prisma/client";
import { db } from "@/app/_shared/lib/prisma";
import { logWhatsAppEvent } from "@/app/_shared/lib/log";
import {
  sendBotReply,
  postInternalNote,
  qualifyToQueue,
  findLinkedCard,
} from "@/app/_shared/lib/whatsapp/bot";
import { sendSystemWhatsApp, findOrCreateContactByPhone } from "@/app/_shared/lib/whatsapp/outbound";
import { whatsappRecipients } from "@/app/_shared/lib/whatsapp/service";
import { generateKitPdf, sha256 } from "./pdf";
import { newSignatureToken, tokenExpiry, signUrlFor } from "./tokens";

// CICLO DA ASSINATURA ELETRÔNICA (própria — sem ZapSign)
//
//   1. A IA do microserviço EXTRAI os dados do KIT da conversa + documentos
//      (RG/CNH por visão): nome, nacionalidade, estado civil, profissão, RG,
//      CPF e endereço completo.
//   2. O código VALIDA campo a campo (obrigatoriedade + confiança mínima +
//      dígito verificador do CPF + CEP no ViaCEP). Qualquer pendência → NADA
//      é enviado: nota interna lista o que faltou e o atendente segue à mão.
//   3. Dados fechados → o cliente CONFIRMA o resumo no WhatsApp.
//   4. Confirmado → KIT preenchido vira PDF, vai pro S3 e o cliente recebe o
//      link /assinar/<token> do nosso site.
//   5. Cron lembra quem não assinou (3x, horário comercial) e expira o que
//      apodreceu.
//   6. Assinou → finalizeSignature: PDF carimbado no card + conversa de volta
//      pra FILA com nota de VALIDAÇÃO (a conferência final é SEMPRE humana).

const CHATBOT_URL = process.env.CHATBOT_URL?.replace(/\/$/, "") ?? "";
const CHATBOT_SECRET = process.env.CHATBOT_SECRET ?? "";
const EXTRACT_TIMEOUT_MS = 90_000; // visão sobre RG/CNH é pesada

const SIGN_REMINDER_MAX = 3;
const SIGN_REMINDER_GAP_MS = 24 * 60 * 60_000;
const SIGN_REMINDER_RETRY_MS = 6 * 60 * 60_000; // janela fechada/cooldown
// Template aprovado na Meta para lembrar fora da janela de 24h ({{1}} = nome).
const SIGN_REMINDER_TEMPLATE = "lembrete_assinatura";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const AUTHOR_ID = "whatsapp-bot";
const AUTHOR_NAME = "🖊️ Assinatura eletrônica";

/**
 * Chave geral do fluxo AUTOMÁTICO (o gatilho na qualificação). Desligada, a
 * qualificação segue o caminho de sempre — mas o botão MANUAL continua
 * funcionando, que é como a equipe roda o piloto.
 */
export function isAutoSignatureEnabled(): boolean {
  return process.env.SIGNATURE_AUTO_ENABLED === "true";
}

/**
 * TRAVA DE SEGURANÇA da equipe (botão na aba Contratos): pausa a automação
 * NA HORA, sem deploy — o bot volta a qualificar direto pra fila, como antes
 * da assinatura automática existir. Não afeta o botão manual nem os ciclos já
 * em andamento (cliente no meio da coleta/confirmação termina o que começou;
 * deixá-lo sem resposta seria pior que concluir o ciclo).
 */
export const SIGNATURE_AUTO_PAUSE_KEY = "signature_auto_paused";

/** Automação efetivamente ATIVA = env ligada E ninguém apertou a pausa. */
export async function isAutoSignatureActive(): Promise<boolean> {
  if (!isAutoSignatureEnabled()) return false;
  const row = await db.appSetting
    .findUnique({ where: { key: SIGNATURE_AUTO_PAUSE_KEY } })
    .catch(() => null);
  return row?.value !== "true";
}

// ---------------------------------------------------------------------------
// Campos do KIT e validação
// ---------------------------------------------------------------------------

export const CONTRACT_FIELD_KEYS = [
  "name", "nacionalidade", "estado_civil", "profissao", "rg", "cpf",
  "rua", "numero", "bairro", "cep", "cidade", "estado",
] as const;

export type ContractFieldKey = (typeof CONTRACT_FIELD_KEYS)[number];

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

export interface ExtractedField {
  value: string;
  confidence: number;
  source: "documento" | "conversa" | "inferido" | "ausente";
}

export type ExtractedFields = Record<ContractFieldKey, ExtractedField>;

/** Mesmo algoritmo do microserviço: dígitos verificadores do CPF. */
export function isValidCPF(raw: string): boolean {
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

export interface MissingField {
  key: ContractFieldKey | "confirmacao";
  label: string;
  reason: string;
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
 * faltantes vêm do CEP). Devolve pendência quando o CEP não existe ou quando a
 * cidade não bate. ViaCEP fora do ar NÃO trava o fluxo (só loga).
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
    if (data.localidade && fields.cidade?.value && norm(data.localidade) !== norm(fields.cidade.value)) {
      return {
        key: "cep",
        label: FIELD_LABELS.cep,
        reason: `CEP pertence a ${data.localidade}/${data.uf}, mas o cliente informou ${fields.cidade.value} — confirmar qual está certo`,
      };
    }
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
    console.warn("[SIGN] ViaCEP indisponível (seguindo sem a checagem):", err);
  }
  return null;
}

/** Valida a extração campo a campo (incl. ViaCEP); vazio = pode gerar documento. */
export async function validateExtraction(fields: ExtractedFields): Promise<MissingField[]> {
  // Estado como sigla ("PR") → nome por extenso, como o template espera.
  const uf = fields.estado?.value?.trim().toUpperCase() ?? "";
  if (UF_NAMES[uf]) fields.estado = { ...fields.estado, value: UF_NAMES[uf] };

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
// Suporte
// ---------------------------------------------------------------------------

/** Documentos (imagem/PDF) que o CLIENTE enviou — viram blocos de visão. */
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

/** Notifica a equipe inteira (sino) — mesmo padrão do handoff do bot. */
async function notifyTeam(contactId: string, contactLabel: string, message: string): Promise<void> {
  try {
    const recipients = await whatsappRecipients();
    for (const id of recipients) {
      await db.notification.create({
        data: {
          recipientId: id,
          authorId: AUTHOR_ID,
          authorName: AUTHOR_NAME,
          targetName: contactLabel,
          message,
          contactId,
        },
      });
    }
  } catch (err) {
    console.error("[SIGN] Falha ao notificar equipe:", err);
  }
}

async function logSignature(
  contactId: string,
  contact: { name: string | null; phone: string },
  message: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await logWhatsAppEvent({
    action: "wa_signature",
    message,
    authorId: AUTHOR_ID,
    authorName: AUTHOR_NAME,
    contactId,
    contactName: contact.name,
    contactPhone: contact.phone,
    metadata,
  }).catch((err) => console.error("[SIGN] log falhou (seguindo):", err));
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
// Geração do documento e do link
// ---------------------------------------------------------------------------

/** Monta o dicionário do docxtemplater a partir dos campos extraídos. */
export function buildDados(fields: ExtractedFields): Record<string, string> {
  const dados: Record<string, string> = {
    data: new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
  };
  for (const key of CONTRACT_FIELD_KEYS) dados[key] = fields[key]?.value ?? "";
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

export type DeliveryMode = "bot" | "atendente" | "nao_enviado";

/**
 * Gera o PDF do KIT, cria o token/link e (opcionalmente) manda pro cliente.
 * Usada nas DUAS portas: fluxo do bot (após o "sim") e geração manual da
 * equipe pelo card/inbox.
 */
async function issueSignature(
  requestId: string,
  contactId: string,
  contact: { phone: string; name: string | null },
  fields: ExtractedFields,
  opts: { delivery: DeliveryMode },
): Promise<{ signUrl: string; pdfKey: string }> {
  const dados = buildDados(fields);

  // Status muda ANTES da geração: se a função morrer no meio, a faxina do cron
  // (aguardando sem pdfKey há 15min+) marca erro e avisa a equipe.
  await db.signatureRequest.update({
    where: { id: requestId },
    data: { status: "aguardando", extracted: fields as unknown as Prisma.InputJsonValue },
  });

  const pdf = await generateKitPdf(dados);
  const documentHash = sha256(pdf);
  const pdfKey = `whatsapp/${contactId}/contrato-kit-${Date.now()}.pdf`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: pdfKey,
    Body: pdf,
    ContentType: "application/pdf",
  }));

  const request = await db.signatureRequest.update({
    where: { id: requestId },
    data: {
      pdfKey,
      documentHash,
      sentAt: new Date(),
      deliveredBy: opts.delivery,
      nextReminderAt: opts.delivery === "nao_enviado" ? null : new Date(Date.now() + SIGN_REMINDER_GAP_MS),
    },
  });
  const signUrl = signUrlFor(request.token);

  // Ficha do contato ganha os dados (pré-preenche o "Adicionar cliente").
  try {
    const existing = await db.whatsAppContact.findUnique({
      where: { id: contactId },
      select: { clientDraft: true },
    });
    const draft = (existing?.clientDraft as Record<string, unknown> | null) ?? {};
    await db.whatsAppContact.update({
      where: { id: contactId },
      data: {
        clientDraft: {
          ...draft,
          ...Object.fromEntries(CONTRACT_FIELD_KEYS.map((k) => [k, fields[k]?.value ?? ""])),
        } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    console.error("[SIGN] Falha ao atualizar clientDraft (seguindo):", err);
  }

  if (opts.delivery !== "nao_enviado") {
    const first = (dados.name || "").split(/\s+/)[0] ?? "";
    await sendBotReply(
      contactId, contact.phone, contact.name,
      `Perfeito${first ? `, ${first}` : ""}! ✅ Preparei sua procuração e o contrato. É só assinar pelo celular, no link abaixo — leva 2 minutinhos. 😊`,
      1500,
    );
    await sendBotReply(contactId, contact.phone, contact.name, signUrl, 1200);
    await sendBotReply(
      contactId, contact.phone, contact.name,
      "Vou te explicar: você abre o link, confere seus dados, assina com o dedo na tela e digita um código que eu mando aqui. Se travar em qualquer parte, é só me chamar. 😊",
      1500,
    );
  }

  await postInternalNote(
    contactId,
    `🖊️ Procuração + contrato (KIT) prontos para ASSINATURA ELETRÔNICA.\n` +
    (opts.delivery === "nao_enviado"
      ? "O link NÃO foi enviado ao cliente — a entrega é manual.\n"
      : "Link enviado ao cliente pelo WhatsApp.\n") +
    `Quando o cliente assinar, a conversa volta pra fila para VALIDAÇÃO humana.\n` +
    `Link: ${signUrl}`,
  );
  await logSignature(contactId, contact, "assinatura: documento gerado e link criado", {
    stage: "enviado", requestId, delivery: opts.delivery, documentHash,
  });
  return { signUrl, pdfKey };
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
    await db.signatureRequest.update({ where: { id: requestId }, data });
  } else {
    await db.signatureRequest.create({
      data: {
        contactId,
        token: newSignatureToken(),
        expiresAt: tokenExpiry(),
        ...data,
      },
    });
  }
  const lista = missing.map((m) => `• ${m.label}: ${m.reason}`).join("\n");
  await postInternalNote(
    contactId,
    `🖊️ Contrato automático NÃO enviado — ${contexto}.\nPendências:\n${lista}\n\n` +
    `➡️ Confirme os dados com o cliente e gere pelo botão "Gerar contrato" do card.`,
  );
  await notifyTeam(contactId, contactLabel, `Contrato de ${contactLabel} precisa de revisão manual (${missing.length} pendência(s)).`);
  await logSignature(contactId, contact, `assinatura: pendências → revisão humana (${missing.map((m) => m.label).join(", ")})`, {
    stage: "revisao_humana", missing: missing.map((m) => m.key),
  });
}

/** Ciclo ativo do contato (o que impede duplicar documento). */
export async function activeCycle(contactId: string) {
  return db.signatureRequest.findFirst({
    where: { contactId, status: { in: ["coletando", "confirmando", "aguardando", "visualizado", "assinado"] } },
    orderBy: { createdAt: "desc" },
  });
}

// ---------------------------------------------------------------------------
// Porta 1: gatilho automático na qualificação
// ---------------------------------------------------------------------------

/**
 * Inicia o fluxo logo após a QUALIFICAÇÃO do lead. Devolve "confirming" quando
 * os dados fecharam e o bot pediu a CONFIRMAÇÃO ao cliente (a conversa fica em
 * modo bot; a fila acontece depois) — qualquer outro desfecho devolve "queue".
 * NUNCA lança: falha vira nota interna + notificação.
 */
export async function maybeStartSignatureFlow(
  contactId: string,
  contact: { phone: string; name: string | null },
): Promise<"confirming" | "queue"> {
  const contactLabel = contact.name ?? `+${contact.phone}`;
  try {
    if (!(await isAutoSignatureActive())) return "queue";
    if (!CHATBOT_URL || !CHATBOT_SECRET) return "queue";

    const active = await activeCycle(contactId);
    if (active) {
      console.log(`[SIGN] ${contactId}: já existe ciclo ${active.status} — não recria.`);
      return "queue";
    }

    const { fields, documentsRead } = await callExtract(contactId, contact);

    const missing = await validateExtraction(fields);
    if (missing.length) {
      // Antes de desistir pro atendente, o BOT pede os dados que faltaram
      // direto ao cliente (texto ou foto do RG/CNH). Só depois de
      // COLLECT_MAX_ROUNDS tentativas sem fechar é que vira revisão humana.
      const request = await db.signatureRequest.create({
        data: {
          contactId,
          token: newSignatureToken(),
          expiresAt: tokenExpiry(),
          status: "coletando",
          origin: "bot",
          extracted: fields as unknown as Prisma.InputJsonValue,
          missingFields: missing as unknown as Prisma.InputJsonValue,
          confirmRounds: 1, // 1ª rodada de pedido (o campo conta as rodadas da etapa atual)
        },
      });
      await sendBotReply(contactId, contact.phone, contact.name, askMissingMessage(missing, documentsRead), 1500);
      await postInternalNote(
        contactId,
        `🖊️ Faltaram dados pro contrato (${missing.map((m) => m.label).join(", ")}) — ` +
        `o bot está PEDINDO ao cliente (até ${COLLECT_MAX_ROUNDS} tentativas antes de passar pra equipe).`,
      );
      await logSignature(contactId, contact, "assinatura: dados incompletos — bot pedindo ao cliente", {
        stage: "coletando", requestId: request.id, missing: missing.map((m) => m.key), documentsRead,
      });
      return "confirming";
    }

    // Dados fechados → pede a CONFIRMAÇÃO do cliente antes de gerar o doc.
    const request = await db.signatureRequest.create({
      data: {
        contactId,
        token: newSignatureToken(),
        expiresAt: tokenExpiry(),
        status: "confirmando",
        origin: "bot",
        extracted: fields as unknown as Prisma.InputJsonValue,
      },
    });

    await sendBotReply(contactId, contact.phone, contact.name, summaryMessage(buildDados(fields)), 1500);
    await postInternalNote(
      contactId,
      `🖊️ Dados do KIT extraídos pela IA (${documentsRead} documento(s) lidos). ` +
      `Resumo enviado ao cliente para CONFIRMAÇÃO — após o "sim", o contrato vai pra assinatura.`,
    );
    await logSignature(contactId, contact, "assinatura: resumo enviado para confirmação do cliente", {
      stage: "confirmando", requestId: request.id, documentsRead,
    });
    return "confirming";
  } catch (err) {
    console.error("[SIGN] Falha no fluxo de assinatura:", contactId, err);
    await db.signatureRequest.updateMany({
      where: { contactId, status: { in: ["coletando", "confirmando", "aguardando"] }, pdfKey: null },
      data: { status: "erro", error: String(err instanceof Error ? err.message : err).slice(0, 500) },
    }).catch(() => {});
    await postInternalNote(
      contactId,
      `🖊️ Contrato automático FALHOU (${err instanceof Error ? err.message : String(err)}). ` +
      `➡️ Gere e envie pelo botão "Gerar contrato" do card.`,
    ).catch(() => {});
    await notifyTeam(contactId, contactLabel, `Falha técnica ao gerar contrato de ${contactLabel} — seguir manualmente.`);
    return "queue";
  }
}

// ---------------------------------------------------------------------------
// COLETA dos dados que a extração não fechou (status "coletando")
//
// A extração rodou mas faltou campo (ou veio com confiança baixa) — em vez de
// jogar direto pro atendente, o bot PEDE ao cliente o que falta. A resposta
// (texto ou foto de RG/CNH) reabastece o histórico e a extração RODA DE NOVO
// por inteiro — é ela quem lê o documento e pega o nome completo. Fechou tudo
// → segue pro resumo de confirmação. 3 rodadas sem fechar → atendente.
// ---------------------------------------------------------------------------

const COLLECT_MAX_ROUNDS = 3;

/** Mensagem pedindo os campos pendentes, em linguagem simples. */
function askMissingMessage(missing: MissingField[], documentsRead: number, retry = false): string {
  const keys = new Set(missing.map((m) => m.key));
  const itens: string[] = [];
  if (keys.has("name")) itens.push("seu *nome completo* (igualzinho está no seu RG)");
  if (keys.has("cpf")) itens.push("o número do seu *CPF*");
  if (keys.has("rg")) itens.push("o número do seu *RG*");
  if (keys.has("estado_civil")) itens.push("seu *estado civil* (solteiro, casado, divorciado...)");
  if (keys.has("profissao")) itens.push("sua *profissão* (o que você trabalha)");
  if (["rua", "numero", "bairro", "cep", "cidade", "estado"].some((k) => keys.has(k as ContractFieldKey))) {
    itens.push("seu *endereço completo com CEP* (rua, número, bairro e cidade)");
  }
  if (keys.has("nacionalidade")) itens.push("sua nacionalidade");
  const lista = itens.map((i) => `📌 ${i}`).join("\n");
  const abertura = retry
    ? "Obrigado! Ainda ficou faltando uma coisinha:"
    : "Estamos quase lá! Pra eu preparar seus documentos certinhos, só preciso de:";
  const docDica = keys.has("name") || keys.has("cpf") || keys.has("rg")
    ? (documentsRead > 0
      ? "\n\nSe puder, me manda uma foto do seu RG ou da CNH *bem iluminada e sem cortar as bordas* — assim eu pego tudo direitinho. 😊"
      : "\n\nSe ficar mais fácil, é só me mandar uma *foto do seu RG ou da CNH* que eu pego esses dados de lá. 😊")
    : "\n\nPode me mandar por aqui mesmo, do jeito que for mais fácil. 😊";
  return `${abertura}\n\n${lista}${docDica}`;
}

/**
 * Trata a resposta do cliente durante a COLETA. Devolve true quando a mensagem
 * foi consumida aqui (o cérebro normal não roda neste turno).
 */
export async function handleCollectionReply(
  contactId: string,
  contact: { phone: string; name: string | null },
): Promise<boolean> {
  const request = await db.signatureRequest.findFirst({
    where: { contactId, status: "coletando" },
    orderBy: { createdAt: "desc" },
  });
  if (!request) return false;

  const contactLabel = contact.name ?? `+${contact.phone}`;
  try {
    // Re-extração COMPLETA: o histórico agora contém a resposta (e/ou o
    // documento novo) — a IA relê tudo, documentos incluídos.
    const { fields, documentsRead } = await callExtract(contactId, contact);
    const missing = await validateExtraction(fields);

    if (!missing.length) {
      await db.signatureRequest.update({
        where: { id: request.id },
        data: {
          status: "confirmando",
          extracted: fields as unknown as Prisma.InputJsonValue,
          missingFields: Prisma.DbNull,
          confirmRounds: 0, // zera: daqui pra frente o campo conta as rodadas da CONFIRMAÇÃO
        },
      });
      await sendBotReply(contactId, contact.phone, contact.name, "Anotei tudo, obrigado! 🙌", 1200);
      await sendBotReply(contactId, contact.phone, contact.name, summaryMessage(buildDados(fields)), 1500);
      await postInternalNote(
        contactId,
        `🖊️ Dados do contrato COMPLETADOS pelo cliente (${documentsRead} documento(s) lidos). Resumo enviado para confirmação.`,
      );
      await logSignature(contactId, contact, "assinatura: coleta concluída — resumo enviado para confirmação", {
        stage: "confirmando", requestId: request.id, documentsRead,
      });
      return true;
    }

    const rounds = request.confirmRounds + 1;
    if (rounds > COLLECT_MAX_ROUNDS) {
      await sendBotReply(
        contactId, contact.phone, contact.name,
        "Pra não te atrapalhar mais, vou pedir pra um dos nossos atendentes fechar esses dados com você, tá bom? Já já alguém te chama por aqui. 😊",
        1500,
      ).catch(() => {});
      await failToHuman(
        contactId, contact, fields, missing,
        `o bot pediu os dados ${COLLECT_MAX_ROUNDS} vezes e ainda faltou informação`,
        request.id,
      );
      await qualifyToQueue(contactId, contactLabel, "coleta de dados do contrato precisa de atendente");
      return true;
    }

    await db.signatureRequest.update({
      where: { id: request.id },
      data: {
        extracted: fields as unknown as Prisma.InputJsonValue,
        missingFields: missing as unknown as Prisma.InputJsonValue,
        confirmRounds: rounds,
      },
    });
    await sendBotReply(contactId, contact.phone, contact.name, askMissingMessage(missing, documentsRead, true), 1500);
    return true;
  } catch (err) {
    console.error("[SIGN] Falha na coleta de dados:", contactId, err);
    await failToHuman(
      contactId, contact, null,
      [{ key: "confirmacao", label: "coleta de dados", reason: `falha técnica na coleta (${err instanceof Error ? err.message : String(err)})` }],
      "falha técnica durante a coleta de dados",
      request.id,
    ).catch(() => {});
    await qualifyToQueue(contactId, contactLabel, "falha técnica na coleta de dados do contrato").catch(() => {});
    return true;
  }
}

// ---------------------------------------------------------------------------
// Resposta do cliente à CONFIRMAÇÃO dos dados
// ---------------------------------------------------------------------------

const CONFIRM_MAX_ROUNDS = 2;

/**
 * Intercepta a mensagem do cliente quando há um ciclo em "confirmando".
 * Devolve true quando a mensagem foi tratada aqui (o cérebro normal NÃO roda).
 */
export async function handleConfirmationReply(
  contactId: string,
  contact: { phone: string; name: string | null },
  clientText: string,
  media: { url: string; mimeType: string } | null,
): Promise<boolean> {
  const request = await db.signatureRequest.findFirst({
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
      await issueSignature(request.id, contactId, contact, fields, { delivery: "bot" });
      // Agora sim o lead entra na fila como qualificado — e o SLA da fila é
      // silenciado: quem dita o ritmo é o ciclo de lembretes de assinatura.
      await qualifyToQueue(contactId, contactLabel, "dados confirmados pelo cliente + contrato enviado para assinatura");
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
        await qualifyToQueue(contactId, contactLabel, "confirmação do contrato precisa de atendente (correções pendentes)");
        return true;
      }
      await db.signatureRequest.update({
        where: { id: request.id },
        data: { extracted: fields as unknown as Prisma.InputJsonValue, confirmRounds: rounds },
      });
      await sendBotReply(contactId, contact.phone, contact.name, out.reply || "Corrigi aqui! Dá uma olhada de novo, por favor:", 1200);
      await sendBotReply(contactId, contact.phone, contact.name, summaryMessage(buildDados(fields)), 1500);
      return true;
    }

    if (out.decision === "nao_entendi" && request.confirmRounds < CONFIRM_MAX_ROUNDS) {
      await db.signatureRequest.update({
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

    await sendBotReply(
      contactId, contact.phone, contact.name,
      "Sem problema! Vou pedir pra um dos nossos atendentes conferir esses dados com você com calma, tá bom? Já já alguém te chama por aqui. 😊",
      1500,
    ).catch(() => {});
    await failToHuman(
      contactId, contact, fields,
      [{
        key: "confirmacao",
        label: "confirmação",
        reason: out.decision === "atendente"
          ? "cliente não sabe/não confirmou os dados (pediu ajuda)"
          : "cliente não entendeu o pedido de confirmação (2 tentativas)",
      }],
      "a confirmação dos dados precisou de um atendente",
      request.id,
    );
    await qualifyToQueue(contactId, contactLabel, "confirmação do contrato precisa de atendente");
    return true;
  } catch (err) {
    console.error("[SIGN] Falha na confirmação de dados:", contactId, err);
    await failToHuman(
      contactId, contact, fields,
      [{ key: "confirmacao", label: "confirmação", reason: `falha técnica na confirmação (${err instanceof Error ? err.message : String(err)})` }],
      "falha técnica na etapa de confirmação",
      request.id,
    ).catch(() => {});
    await qualifyToQueue(contactId, contactLabel, "falha técnica na confirmação do contrato").catch(() => {});
    return true;
  }
}

/**
 * Porta única pro bot.ts: roteia a mensagem do cliente pra etapa de assinatura
 * ativa (coleta de dados pendentes ou confirmação do resumo). Devolve true
 * quando a mensagem foi tratada aqui — o cérebro normal não roda no turno.
 */
export async function handleSignatureClientReply(
  contactId: string,
  contact: { phone: string; name: string | null },
  clientText: string,
  media: { url: string; mimeType: string } | null,
): Promise<boolean> {
  if (await handleCollectionReply(contactId, contact)) return true;
  return handleConfirmationReply(contactId, contact, clientText, media);
}

// ---------------------------------------------------------------------------
// Porta 2: geração MANUAL pela equipe (card ou inbox)
// ---------------------------------------------------------------------------

export interface ManualSignatureResult {
  ok: boolean;
  signUrl?: string;
  requestId?: string;
  error?: string;
  missing?: { label: string; reason: string }[];
}

/** Campos vindos de um card (User/Process) no formato da extração. */
function fieldsFromRecord(card: Record<string, unknown>): ExtractedFields {
  const fields = {} as ExtractedFields;
  const fromCard: Record<ContractFieldKey, unknown> = {
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
    fields[key] = { value: String(fromCard[key] ?? "").trim(), confidence: 1, source: "conversa" };
  }
  return fields;
}

/**
 * Gera o contrato com os DADOS DO CARD e devolve o link pro atendente.
 * Passa pelas MESMAS validações do fluxo automático — dado faltando volta a
 * lista de pendências em vez de gerar documento errado.
 */
export async function createSignatureFromCard(
  cardId: string,
  isProcess: boolean,
  opts: { delivery: DeliveryMode; userId?: string; userName?: string },
): Promise<ManualSignatureResult> {
  const card = isProcess
    ? await db.process.findUnique({ where: { id: cardId } })
    : await db.user.findUnique({ where: { id: cardId } });
  if (!card) return { ok: false, error: "Card não encontrado." };

  const phone = card.telefone || card.telefone_secundario;
  if (!phone) return { ok: false, error: "O card não tem telefone — sem ele não dá pra enviar nem verificar por código." };

  const fields = fieldsFromRecord(card as unknown as Record<string, unknown>);
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

  return createSignatureForContact(contact.id, { phone: contact.phone, name: contact.name ?? card.name }, fields, {
    ...opts,
    origin: "manual_card",
  });
}

/**
 * Gera o contrato a partir de um CONTATO do inbox (usa a ficha `clientDraft`
 * quando não há card vinculado). Mesmo motor, mesmas travas.
 */
export async function createSignatureFromContact(
  contactId: string,
  opts: { delivery: DeliveryMode; userId?: string; userName?: string },
): Promise<ManualSignatureResult> {
  const contact = await db.whatsAppContact.findUnique({
    where: { id: contactId },
    select: { id: true, phone: true, name: true, clientDraft: true, userId: true, processId: true },
  });
  if (!contact) return { ok: false, error: "Contato não encontrado." };

  // Card vinculado tem prioridade (é o cadastro oficial); senão, a ficha.
  const card = contact.userId
    ? await db.user.findUnique({ where: { id: contact.userId } })
    : contact.processId
      ? await db.process.findUnique({ where: { id: contact.processId } })
      : null;

  const base = (card ?? contact.clientDraft ?? {}) as Record<string, unknown>;
  const fields = fieldsFromRecord({ name: contact.name, ...base });

  const missing = await validateExtraction(fields);
  if (missing.length) {
    return {
      ok: false,
      error: "Complete a ficha do contato antes de gerar:",
      missing: missing.map((m) => ({ label: m.label, reason: m.reason })),
    };
  }

  return createSignatureForContact(contact.id, { phone: contact.phone, name: contact.name }, fields, {
    ...opts,
    origin: "manual_inbox",
  });
}

/** Núcleo compartilhado das duas portas manuais. */
async function createSignatureForContact(
  contactId: string,
  contact: { phone: string; name: string | null },
  fields: ExtractedFields,
  opts: { delivery: DeliveryMode; userId?: string; userName?: string; origin: string },
): Promise<ManualSignatureResult> {
  const active = await activeCycle(contactId);
  if (active) {
    const url = active.pdfKey ? signUrlFor(active.token) : undefined;
    return {
      ok: false,
      signUrl: url,
      requestId: active.id,
      error: `Já existe um ciclo de assinatura "${active.status}" para este cliente${url ? " — o link atual está aí embaixo" : ""}.`,
    };
  }

  try {
    const request = await db.signatureRequest.create({
      data: {
        contactId,
        token: newSignatureToken(),
        expiresAt: tokenExpiry(),
        status: "aguardando",
        origin: opts.origin,
        createdById: opts.userId ?? null,
        createdByName: opts.userName ?? null,
        extracted: fields as unknown as Prisma.InputJsonValue,
      },
    });
    const { signUrl } = await issueSignature(request.id, contactId, contact, fields, {
      delivery: opts.delivery,
    });
    if (opts.userName) {
      await postInternalNote(
        contactId,
        `👤 ${opts.userName} gerou o contrato manualmente` +
        (opts.delivery === "bot" ? " e o sistema enviou o link pelo WhatsApp." :
         opts.delivery === "atendente" ? " e vai entregar o link ao cliente." :
         " apenas para uso offline (link não enviado)."),
      ).catch(() => {});
    }
    return { ok: true, signUrl, requestId: request.id };
  } catch (err) {
    console.error("[SIGN] Falha na geração manual:", contactId, err);
    await notifyTeam(contactId, contact.name ?? `+${contact.phone}`, "Falha técnica ao gerar contrato manualmente — ver logs.");
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// Pós-assinatura
// ---------------------------------------------------------------------------

/** Cliente abriu o link. */
export async function markViewed(requestId: string): Promise<void> {
  await db.signatureRequest.updateMany({
    where: { id: requestId, status: "aguardando" },
    data: { status: "visualizado", viewedAt: new Date() },
  });
}

/**
 * Anexa o PDF assinado ao card do cliente. Sem card vinculado, entra no
 * rascunho de documentos do contato — que migra sozinho quando o atendente
 * criar o cadastro ("Adicionar cliente").
 */
async function attachSignedPdf(contactId: string, signedPdfKey: string): Promise<"card" | "rascunho" | "falhou"> {
  const nome = "Procuração e contrato assinados.pdf";
  try {
    const card = await findLinkedCard(contactId);
    if (card) {
      if (card.kind === "user") {
        await db.document.create({ data: { userId: card.id, key: signedPdfKey, name: nome } });
      } else {
        const process = await db.process.findUnique({ where: { id: card.id }, select: { userId: true } });
        if (!process?.userId) throw new Error("processo sem userId");
        await db.document.create({
          data: { userId: process.userId, processId: card.id, key: signedPdfKey, name: nome },
        });
      }
      return "card";
    }

    const contact = await db.whatsAppContact.findUnique({
      where: { id: contactId },
      select: { draftDocuments: true },
    });
    const docs = Array.isArray(contact?.draftDocuments) ? (contact!.draftDocuments as unknown[]) : [];
    await db.whatsAppContact.update({
      where: { id: contactId },
      data: {
        draftDocuments: [
          ...docs,
          { key: signedPdfKey, name: nome, uploadedAt: new Date().toISOString() },
        ] as unknown as Prisma.InputJsonValue,
      },
    });
    return "rascunho";
  } catch (err) {
    console.error("[SIGN] Falha ao anexar PDF assinado:", contactId, err);
    return "falhou";
  }
}

/**
 * Consolida um documento ASSINADO: anexa no card, devolve a conversa pra fila
 * com nota de validação e agradece o cliente. Idempotente.
 * O PDF carimbado já foi gravado no S3 pela action da página de assinatura.
 */
export async function finalizeSignature(requestId: string): Promise<void> {
  const request = await db.signatureRequest.findUnique({
    where: { id: requestId },
    include: { contact: true },
  });
  if (!request || !request.signedPdfKey) return;
  if (request.status === "validado") return;

  const contact = request.contact;
  const label = contact.name ?? `+${contact.phone}`;
  const destino = await attachSignedPdf(request.contactId, request.signedPdfKey);

  // Conversa volta pra FILA — MAS sem roubar o ticket de um atendente que já
  // esteja com ela (status "human" com dono).
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
    console.error("[SIGN] Falha ao reencaminhar conversa pós-assinatura:", err);
  }

  const fields = (request.extracted ?? {}) as unknown as ExtractedFields;
  const checklist = CONTRACT_FIELD_KEYS
    .map((k) => `   • ${FIELD_LABELS[k]}: ${fields[k]?.value ?? "—"} (${fields[k]?.source ?? "?"}${
      fields[k]?.confidence !== undefined ? `, ${Math.round((fields[k]?.confidence ?? 0) * 100)}%` : ""})`)
    .join("\n");

  await postInternalNote(
    request.contactId,
    `✅ CONTRATO ASSINADO pelo cliente.\n` +
    `➡️ VALIDAR: confira os dados abaixo contra os documentos que ele enviou e dê sequência.\n` +
    `${checklist}\n\n` +
    (destino === "card" ? "📎 PDF assinado anexado ao card (aba Arquivos)." :
     destino === "rascunho" ? "📎 PDF assinado na ficha do contato (migra pro card ao criar o cadastro)." :
     "⚠️ NÃO consegui anexar o PDF automaticamente — ele está no S3, anexe à mão."),
  );
  await notifyTeam(request.contactId, label, `✅ ${label} ASSINOU o contrato — validar agora.`);
  await logSignature(request.contactId, contact, "assinatura: documento assinado pelo cliente", {
    stage: "assinado", requestId, destino,
  });

  // Agradecimento + passagem silenciosa pro humano.
  try {
    await sendBotReply(
      request.contactId, contact.phone, contact.name,
      "Recebemos sua assinatura! ✅ Obrigado. A partir de agora um atendente da nossa equipe segue com você por aqui, pra conferir seus documentos e dar entrada no seu pedido. 😊",
      1200,
    );
  } catch (err) {
    console.warn("[SIGN] Confirmação pós-assinatura não entregue (ok):", err);
  }
}

/** Cliente pediu ajuda na página (não consegue assinar) → atendente. */
export async function requestHumanHelp(requestId: string, motivo: string): Promise<void> {
  const request = await db.signatureRequest.findUnique({
    where: { id: requestId },
    include: { contact: true },
  });
  if (!request) return;
  const label = request.contact.name ?? `+${request.contact.phone}`;
  await postInternalNote(
    request.contactId,
    `🙋 Cliente pediu AJUDA na página de assinatura (${motivo}). ➡️ Chamar no WhatsApp e ajudar a assinar.`,
  );
  await notifyTeam(request.contactId, label, `🙋 ${label} não conseguiu assinar sozinho — precisa de ajuda.`);
  await db.whatsAppConversation.update({
    where: { contactId: request.contactId },
    data: { status: "queued", assignedToId: null, queuedAt: new Date(), queueAlertAt: null },
  }).catch(() => {});
  await logSignature(request.contactId, request.contact, "assinatura: cliente pediu ajuda na página", {
    stage: "ajuda", requestId, motivo,
  });
}

// ---------------------------------------------------------------------------
// Lembretes + faxina (cron de 15min)
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
    `Oi${first ? `, ${first}` : ""}! Vi que seu contrato ainda está esperando sua assinatura. É rapidinho, direto pelo celular: ${url} 😊`,
  (first: string, url: string) =>
    `${first ? `${first}, f` : "F"}alta só a sua assinatura pra gente dar andamento no seu caso! Assina aqui quando puder: ${url} 🙏`,
  (first: string, url: string) =>
    `${first ? `${first}, e` : "E"}ssa é minha última lembrança, tá? Sem a assinatura a gente não consegue dar entrada no seu benefício — e falta só esse passo. ${url}`,
];

export interface ReminderResults {
  reminders: number;
  exhausted: number;
  expired: number;
  errors: number;
}

/** Roda no cron: lembra quem não assinou, expira o que apodreceu e faz faxina. */
export async function runSignatureReminders(now: number): Promise<ReminderResults> {
  const results: ReminderResults = { reminders: 0, exhausted: 0, expired: 0, errors: 0 };

  // 1. Faxina: ciclo que morreu no MEIO da geração (sem pdfKey há 15min+).
  const orphans = await db.signatureRequest.findMany({
    where: { status: "aguardando", pdfKey: null, createdAt: { lte: new Date(now - 15 * 60_000) } },
    take: 10,
  });
  for (const o of orphans) {
    await db.signatureRequest.update({
      where: { id: o.id },
      data: { status: "erro", error: "geração interrompida (sem PDF) — limpo pelo cron" },
    });
    await postInternalNote(
      o.contactId,
      "🖊️ A geração automática do contrato foi interrompida no meio (falha técnica). ➡️ Gerar e enviar manualmente.",
    ).catch(() => {});
  }

  // 2. Coleta/confirmação abandonada: bot pediu dado (ou o resumo) e o
  //    cliente sumiu por 12h+.
  const staleConfirm = await db.signatureRequest.findMany({
    where: { status: { in: ["coletando", "confirmando"] }, updatedAt: { lte: new Date(now - 12 * 60 * 60_000) } },
    include: { contact: true },
    take: 10,
  });
  for (const req of staleConfirm) {
    try {
      const label = req.contact.name ?? `+${req.contact.phone}`;
      const eraColeta = req.status === "coletando";
      await db.signatureRequest.update({ where: { id: req.id }, data: { status: "confirmacao_expirada" } });
      await postInternalNote(
        req.contactId,
        eraColeta
          ? "⏰ Cliente não mandou os dados que faltavam pro contrato (12h). ➡️ Conferir os dados com ele e gerar pelo botão do card."
          : "⏰ Cliente não respondeu à confirmação dos dados do contrato (12h). ➡️ Conferir os dados com ele e gerar pelo botão do card.",
      );
      await qualifyToQueue(req.contactId, label, eraColeta
        ? "coleta de dados do contrato sem resposta (12h) — atendente assume"
        : "confirmação do contrato sem resposta (12h) — atendente assume");
      results.exhausted++;
    } catch (err) {
      console.error("[SIGN] Falha na expiração de confirmação:", req.id, err);
      results.errors++;
    }
  }

  // 3. Link vencido (7 dias sem assinar).
  const vencidos = await db.signatureRequest.findMany({
    where: { status: { in: ["aguardando", "visualizado"] }, expiresAt: { lte: new Date(now) } },
    include: { contact: true },
    take: 10,
  });
  for (const req of vencidos) {
    try {
      const label = req.contact.name ?? `+${req.contact.phone}`;
      await db.signatureRequest.update({
        where: { id: req.id },
        data: { status: "expirado", nextReminderAt: null },
      });
      await postInternalNote(
        req.contactId,
        "⏰ O link de assinatura VENCEU (7 dias). ➡️ Falar com o cliente e gerar um novo pelo botão do card.",
      );
      await notifyTeam(req.contactId, label, `⏰ Link de assinatura de ${label} venceu sem assinatura.`);
      results.expired++;
    } catch (err) {
      console.error("[SIGN] Falha ao expirar ciclo:", req.id, err);
      results.errors++;
    }
  }

  // 4. Lembretes.
  const due = await db.signatureRequest.findMany({
    where: {
      status: { in: ["aguardando", "visualizado"] },
      pdfKey: { not: null },
      nextReminderAt: { not: null, lte: new Date(now) },
    },
    include: { contact: true },
    take: 15,
  });

  for (const req of due) {
    try {
      // Fora do horário comercial → adia sem gastar lembrete.
      const slot = nextBusinessSlot(now);
      if (slot.getTime() > now) {
        await db.signatureRequest.update({ where: { id: req.id }, data: { nextReminderAt: slot } });
        continue;
      }

      const label = req.contact.name ?? `+${req.contact.phone}`;
      if (req.remindersSent >= SIGN_REMINDER_MAX) {
        await db.signatureRequest.update({ where: { id: req.id }, data: { nextReminderAt: null } });
        await db.whatsAppConversation.update({
          where: { contactId: req.contactId },
          data: { status: "queued", assignedToId: null, queuedAt: new Date(), queueAlertAt: null },
        }).catch(() => {});
        await postInternalNote(
          req.contactId,
          `⏰ Cliente não assinou após ${SIGN_REMINDER_MAX} lembretes. ➡️ Tentar contato manual (ligação?). Link: ${signUrlFor(req.token)}`,
        );
        await notifyTeam(req.contactId, label, `⏰ ${label} não assinou após ${SIGN_REMINDER_MAX} lembretes — resgate manual.`);
        results.exhausted++;
        continue;
      }

      const attempt = req.remindersSent + 1;
      const first = (req.contact.name ?? "").trim().split(/\s+/)[0] ?? "";
      const text = REMINDER_TEXTS[Math.min(attempt, REMINDER_TEXTS.length) - 1](first, signUrlFor(req.token));
      const sent = await sendSystemWhatsApp({
        phone: req.contact.phone,
        clientName: req.contact.name,
        text,
        templateName: SIGN_REMINDER_TEMPLATE,
        templateVars: [first || "tudo bem"],
        // Botão "Assinar documentos" do template: URL com o token como sufixo.
        templateButtonVar: req.token,
        authorId: AUTHOR_ID,
        authorName: AUTHOR_NAME,
        source: "signature_reminder",
      });
      if (sent.sent) {
        await db.signatureRequest.update({
          where: { id: req.id },
          data: { remindersSent: attempt, nextReminderAt: nextBusinessSlot(now + SIGN_REMINDER_GAP_MS) },
        });
        results.reminders++;
      } else {
        // Janela fechada sem template aprovado / cooldown / opt-out → re-tenta
        // em 6h sem gastar tentativa (o motivo fica no log do outbound).
        await db.signatureRequest.update({
          where: { id: req.id },
          data: { nextReminderAt: nextBusinessSlot(now + SIGN_REMINDER_RETRY_MS) },
        });
      }
    } catch (err) {
      console.error("[SIGN] Falha no lembrete de assinatura:", req.id, err);
      results.errors++;
    }
  }

  return results;
}

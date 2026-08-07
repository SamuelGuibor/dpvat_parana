/* eslint-disable @typescript-eslint/no-explicit-any */
// Preenchimento automático da ficha do cliente pela IA.
//
// A cada lote de mensagens recebidas no webhook, a IA lê o histórico recente
// da conversa (texto + transcrições de áudio + fotos/PDFs enviados pelo
// cliente — RG, CNH, comprovantes...) e extrai os campos da ficha que ainda
// estão VAZIOS (nome, CPF, endereço, estado civil, profissão...). Nunca
// sobrescreve o que já foi preenchido — humano ou IA anterior.
//
// Contato vinculado a um User → grava direto no cadastro (mesma regra da
// ficha manual em client-info.ts); sem vínculo → rascunho clientDraft.
// Best-effort: falha aqui NUNCA quebra o webhook.

import Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/app/_shared/lib/prisma";
import { createLog, logWhatsAppEvent } from "@/app/_shared/lib/log";

/** Ação do log do card quando a IA preenche a ficha (aba Histórico). */
export const FICHA_AI_ACTION = "ficha_ai_fill";

// Mesmo subset editável da ficha manual (client-info.ts) com duas exceções:
//  - email fica de fora de propósito (é unique no User; palpite errado quebra
//    o login do cliente);
//  - hospital NUNCA é preenchido (é um select com cadastro próprio) — a IA só
//    guarda o que o cliente falou em `hospitalHint`, pro atendente escolher.
const AI_FIELDS = [
  "name", "cpf", "rg", "data_nasc", "data_acidente",
  "estado_civil", "profissao", "nome_mae", "cidade", "estado",
  "rua", "bairro", "numero", "cep", "lesoes",
  // Extras: só entram se o cliente mandar espontaneamente. O bot NÃO pergunta
  // nada disso — o prompt de triagem segue intocado.
  "telefone_secundario", "rede_social",
] as const;
type AiField = (typeof AI_FIELDS)[number];

const FIELD_LABELS: Record<AiField, string> = {
  name: "Nome completo",
  cpf: "CPF",
  rg: "RG",
  data_nasc: "Data de nascimento (DD/MM/AAAA, ou só o ano se for o que ele disse)",
  data_acidente: "Data do acidente (DD/MM/AAAA, ou só o ano/mês-ano se for o que ele disse)",
  estado_civil: "Estado civil",
  profissao: "Profissão",
  nome_mae: "Nome da mãe",
  cidade: "Cidade",
  estado: "Estado (UF)",
  rua: "Rua/logradouro",
  bairro: "Bairro",
  numero: "Número do endereço",
  cep: "CEP",
  lesoes: "Lesões relatadas",
  telefone_secundario: "Outro telefone de contato (só se ele informar)",
  rede_social: "Instagram/Facebook do cliente (só se ele informar)",
};

const MAX_HISTORY = 30;
const MAX_MEDIA_FILES = 4;
const MAX_FILE_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function fetchS3Buffer(key: string): Promise<Buffer> {
  const res = await s3.send(
    new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: key }),
  );
  const chunks: Buffer[] = [];
  for await (const chunk of res.Body as any) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function extractJson(text: string): any {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Resposta da IA sem JSON");
  return JSON.parse(text.slice(start, end + 1));
}

/** Campos atuais da ficha (User vinculado ou rascunho da conversa). */
async function currentFields(contact: {
  userId: string | null;
  clientDraft: unknown;
  name: string | null;
}): Promise<Record<AiField, string | null>> {
  const out = Object.fromEntries(AI_FIELDS.map((f) => [f, null])) as Record<AiField, string | null>;
  if (contact.userId) {
    const user = await db.user.findUnique({
      where: { id: contact.userId },
      select: Object.fromEntries(AI_FIELDS.map((f) => [f, true])) as Record<string, true>,
    });
    if (user) {
      const u = user as unknown as Record<string, string | null>;
      for (const f of AI_FIELDS) out[f] = u[f]?.trim() ? u[f] : null;
      return out;
    }
  }
  const draft = (contact.clientDraft ?? {}) as Record<string, string | null>;
  for (const f of AI_FIELDS) {
    const v = draft[f];
    out[f] = typeof v === "string" && v.trim() ? v : null;
  }
  if (!out.name && contact.name?.trim()) out.name = contact.name;
  return out;
}

export interface FichaAiResult {
  /** Campos efetivamente preenchidos nesta rodada. */
  filled: string[];
  /** Documentos do cliente anexados nesta rodada (nome dado pela IA). */
  attached?: string[];
  /** Hospital citado pelo cliente (a IA nunca preenche o campo). */
  hospitalHint?: string | null;
  /** Por que nada foi preenchido (quando aplicável) — visível na UI/manual. */
  reason?: string;
}

type DraftDoc = { key: string; name: string; uploadedAt: string };

/** Chaves S3 que já viraram documento do cliente (card ou rascunho). */
async function attachedKeys(contact: {
  userId: string | null; draftDocuments: unknown;
}): Promise<Set<string>> {
  if (contact.userId) {
    const docs = await db.document.findMany({
      where: { userId: contact.userId },
      select: { key: true },
    });
    return new Set(docs.map((d) => d.key));
  }
  return new Set(((contact.draftDocuments ?? []) as DraftDoc[]).map((d) => d.key));
}

/** O cliente mandou algum anexo que ainda não virou documento da ficha? */
async function hasUnattachedMedia(contact: {
  id: string; userId: string | null; draftDocuments: unknown;
}): Promise<boolean> {
  const rows = await db.whatsAppMessage.findMany({
    where: { contactId: contact.id, direction: "in", internal: false, deletedAt: null, mediaKey: { not: null } },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORY,
    select: { mediaKey: true, mediaType: true },
  });
  if (!rows.length) return false;
  const already = await attachedKeys(contact);
  return rows.some(
    (m) => m.mediaKey
      && !already.has(m.mediaKey)
      && (/^image\/(jpeg|png|webp|gif)$/.test(m.mediaType ?? "") || m.mediaType === "application/pdf"),
  );
}

/**
 * Anexa na ficha do cliente os documentos que ele mandou espontaneamente,
 * nomeados pelo que a IA identificou ("RG", "Raio X", "Laudo médico"...).
 * Mesma regra do botão "Anexar no card": aponta pra mesma chave S3 da
 * mensagem, sem re-upload. Sem User vinculado, vai pro rascunho.
 */
async function attachDocuments(
  contact: { id: string; userId: string | null; draftDocuments: unknown },
  mediaRefs: string[],
  docs: unknown,
): Promise<string[]> {
  if (!Array.isArray(docs) || !docs.length || !mediaRefs.length) return [];

  const named: { key: string; name: string }[] = [];
  for (const d of docs) {
    const i = Number((d as any)?.i);
    const tipo = String((d as any)?.tipo ?? "").trim();
    const key = mediaRefs[i];
    if (!key || !tipo) continue;
    // Extensão do arquivo original, para o preview abrir certo.
    const ext = key.includes(".") ? key.slice(key.lastIndexOf(".")) : "";
    named.push({ key, name: `${tipo.slice(0, 60)}${ext}` });
  }
  if (!named.length) return [];

  const saved: string[] = [];
  try {
    if (contact.userId) {
      for (const doc of named) {
        const dup = await db.document.findFirst({
          where: { userId: contact.userId, key: doc.key },
          select: { id: true },
        });
        if (dup) continue;
        await db.document.create({ data: { userId: contact.userId, key: doc.key, name: doc.name } });
        saved.push(doc.name);
      }
    } else {
      const drafts = ((contact.draftDocuments ?? []) as DraftDoc[]).slice();
      for (const doc of named) {
        if (drafts.some((d) => d.key === doc.key)) continue;
        drafts.push({ key: doc.key, name: doc.name, uploadedAt: new Date().toISOString() });
        saved.push(doc.name);
      }
      if (saved.length) {
        await db.whatsAppContact.update({
          where: { id: contact.id },
          data: { draftDocuments: drafts as unknown as Prisma.InputJsonValue },
        });
      }
    }
  } catch (err) {
    console.error("[WHATSAPP FICHA-AI] Falha ao anexar documento:", contact.id, err);
  }
  return saved;
}

/**
 * Extrai da conversa os campos vazios da ficha e persiste. Chamado pelo
 * webhook a cada lote de mensagens novas do cliente (e manualmente pelo botão
 * do Copiloto) — só chama a IA quando ainda existe campo vazio.
 */
export async function autoFillClientInfo(contactId: string): Promise<FichaAiResult> {
  try {
    if (!process.env.CLAUDE_API_KEY) {
      return { filled: [], reason: "CLAUDE_API_KEY não configurada no servidor." };
    }

    const contact = await db.whatsAppContact.findUnique({
      where: { id: contactId },
      select: {
        id: true, userId: true, clientDraft: true, name: true, phone: true,
        draftDocuments: true, aiFilledFields: true,
      },
    });
    if (!contact) return { filled: [], reason: "Contato não encontrado." };

    const fields = await currentFields(contact);
    const missing = AI_FIELDS.filter((f) => !fields[f]);
    // Ficha completa ainda vale uma rodada se o cliente mandou documento novo
    // ("mandou o raio X do nada") — a IA identifica e anexa. Sem campo vazio e
    // sem anexo pendente, não gasta IA.
    if (!missing.length && !(await hasUnattachedMedia(contact))) {
      return { filled: [], reason: "A ficha já está completa." };
    }

    // Histórico recente (texto + transcrições). Sem conteúdo útil → não gasta IA.
    const rows = await db.whatsAppMessage.findMany({
      where: { contactId, internal: false, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: MAX_HISTORY,
      select: {
        direction: true, sentByBot: true, body: true, transcript: true,
        mediaKey: true, mediaType: true,
      },
    });
    const history = rows.slice().reverse();
    const hasClientContent = history.some(
      (m) => m.direction === "in" && (m.body?.trim() || m.transcript || m.mediaKey),
    );
    if (!hasClientContent) return { filled: [], reason: "Sem mensagens do cliente para analisar." };

    const content: any[] = [];

    // Fotos/PDFs recentes ENVIADOS PELO CLIENTE (RG/CNH/comprovantes) entram
    // como anexo pra IA ler o documento de verdade.
    let total = 0;
    let mediaCount = 0;
    // Chaves S3 na MESMA ordem em que os anexos entram no content — é assim
    // que o índice devolvido pela IA em "docs" volta a apontar pro arquivo.
    const mediaRefs: string[] = [];
    for (const m of [...history].reverse()) {
      if (mediaCount >= MAX_MEDIA_FILES) break;
      if (m.direction !== "in" || !m.mediaKey || !m.mediaType) continue;
      const isImage = /^image\/(jpeg|png|webp|gif)$/.test(m.mediaType);
      const isPdf = m.mediaType === "application/pdf";
      if (!isImage && !isPdf) continue;
      try {
        const buf = await fetchS3Buffer(m.mediaKey);
        if (buf.length > MAX_FILE_BYTES || total + buf.length > MAX_TOTAL_BYTES) continue;
        total += buf.length;
        mediaCount += 1;
        mediaRefs.push(m.mediaKey);
        content.push(
          isImage
            ? { type: "image", source: { type: "base64", media_type: m.mediaType, data: buf.toString("base64") } }
            : { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } },
        );
      } catch {
        // anexo indisponível — segue só com o texto
      }
    }

    const transcriptText = history
      .map((m) => {
        const who = m.direction === "in" ? "CLIENTE" : m.sentByBot ? "BOT" : "ATENDENTE";
        const text = m.body?.trim()
          ? m.body
          : m.transcript
            ? `[áudio] ${m.transcript}`
            : m.mediaKey
              ? "📎 (anexo)"
              : "";
        return text ? `${who}: ${text}` : null;
      })
      .filter(Boolean)
      .join("\n");

    const prompt = `Você é o assistente da Paraná Seguros (assessoria previdenciária). Leia a conversa de WhatsApp abaixo (e os documentos anexados, se houver — RG, CNH, comprovantes etc.) e extraia SOMENTE os dados do CLIENTE para a ficha de cadastro.

Campos que ainda estão VAZIOS na ficha (extraia apenas estes):
${missing.length
      ? missing.map((f) => `- ${f}: ${FIELD_LABELS[f]}`).join("\n")
      : "- (nenhum: a ficha já está completa — devolva \"fields\" vazio e só identifique os documentos anexados)"}

Regras:
- Só preencha um campo se o dado estiver EXPLÍCITO na conversa ou legível num documento anexado. NUNCA invente nem deduza.
- Dados de terceiros (parentes, atendente) NÃO entram.
- Se um documento anexado (RG/CNH/CIN) trouxer nome, CPF, RG, data de nascimento ou nome da mãe, prefira o que está no documento.
- DATAS: use DD/MM/AAAA quando a data completa estiver dita. Se o cliente só souber o ANO ("foi em 2019"), devolva "2019"; se souber mês e ano ("março de 2019"), devolva "03/2019". É melhor registrar o ano do que deixar vazio — mas nunca chute o dia ou o mês que ele não disse.
- CPF/CEP com a máscara usual. Estado como UF (ex.: PR).
- HOSPITAL: não é um campo da ficha aqui. Se o cliente disser onde foi atendido, devolva o nome em "hospitalMencionado" — quem escolhe no cadastro é o atendente.
- DOCUMENTOS ANEXADOS: para cada anexo que você recebeu, diga o que é em "docs", na MESMA ORDEM em que apareceram (índice 0 = primeiro anexo). Use rótulos curtos: "RG", "CNH", "Comprovante de residência", "Raio X", "Laudo médico", "Carteira de trabalho", "Boletim de ocorrência", "Outro". Se não der para identificar, use "Outro".
- Se nada foi encontrado, devolva "fields" vazio.

CONVERSA:
${transcriptText}

Responda APENAS com JSON válido:
{"fields": {"campo": "valor", ...}, "hospitalMencionado": "nome ou null", "docs": [{"i": 0, "tipo": "RG"}]}`;

    content.push({ type: "text", text: prompt });

    const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    const response = await client.messages.create({
      // Haiku: roda a cada lote de mensagens — leitura de documento + extração
      // simples não justifica modelo maior.
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      messages: [{ role: "user", content }],
    });
    if (response.stop_reason === "refusal") {
      return { filled: [], reason: "A IA recusou a análise deste conteúdo." };
    }
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    const parsed = extractJson(text);
    const extracted = (parsed?.fields ?? {}) as Record<string, unknown>;

    // Só aceita campos pedidos (vazios) com valor string não-vazio.
    const updates: Record<string, string> = {};
    for (const f of missing) {
      const v = extracted[f];
      if (typeof v === "string" && v.trim()) updates[f] = v.trim();
    }

    // Hospital nunca é preenchido: vira dica pro atendente escolher no select.
    const hint = parsed?.hospitalMencionado;
    const hospitalHint =
      typeof hint === "string" && hint.trim() && hint.trim().toLowerCase() !== "null"
        ? hint.trim().slice(0, 120)
        : null;
    if (hospitalHint) {
      await db.whatsAppContact.update({ where: { id: contactId }, data: { hospitalHint } });
    }

    // Documento que o cliente mandou por conta própria já vira arquivo do
    // cliente, com o nome do que a IA identificou (RG, Raio X, laudo...).
    const attached = await attachDocuments(contact, mediaRefs, parsed?.docs);

    if (!Object.keys(updates).length) {
      const extras = [
        attached.length ? `anexou ${attached.length} documento(s)` : null,
        hospitalHint ? `hospital citado: ${hospitalHint}` : null,
      ].filter(Boolean);
      return {
        filled: [],
        attached,
        hospitalHint,
        reason: extras.length
          ? `Nenhum campo novo, mas ${extras.join(" e ")}.`
          : "A IA não encontrou dados novos na conversa.",
      };
    }

    if (contact.userId) {
      await db.user.update({ where: { id: contact.userId }, data: updates });
    } else {
      const draft = (contact.clientDraft ?? {}) as Record<string, string | null>;
      await db.whatsAppContact.update({
        where: { id: contactId },
        data: { clientDraft: { ...draft, ...updates } as Prisma.InputJsonValue },
      });
    }
    // Nome extraído também atualiza o nome do contato (lista do inbox).
    if (updates.name) {
      await db.whatsAppContact.update({
        where: { id: contactId },
        data: { name: updates.name },
      });
    }

    // Marca a origem "IA" dos campos desta rodada — a ficha mostra o selo e o
    // atendente sabe o que conferir. Editar o campo na mão remove a marca.
    const now = new Date().toISOString();
    const marks = { ...((contact.aiFilledFields ?? {}) as Record<string, string>) };
    for (const f of Object.keys(updates)) marks[f] = now;
    await db.whatsAppContact.update({
      where: { id: contactId },
      data: { aiFilledFields: marks as Prisma.InputJsonValue },
    });

    // Contato já vinculado a um card → o preenchimento entra no HISTÓRICO do
    // card (aba Logs), com os valores, e não só na atividade do WhatsApp.
    if (contact.userId) {
      await createLog({
        action: FICHA_AI_ACTION,
        message: `IA preencheu a ficha pela conversa do WhatsApp: ${Object.keys(updates)
          .map((f) => FIELD_LABELS[f as AiField] ?? f)
          .join(", ")}`,
        authorId: "whatsapp-bot",
        authorName: "🤖 IA — Ficha",
        userId: contact.userId,
        metadata: {
          fields: updates,
          ...(attached.length ? { documentos: attached } : {}),
          ...(hospitalHint ? { hospitalCitado: hospitalHint } : {}),
        },
      });
    }

    const usage = response.usage
      ? {
          model: response.model,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          cacheReadTokens: (response.usage as any).cache_read_input_tokens ?? 0,
          cacheWriteTokens: (response.usage as any).cache_creation_input_tokens ?? 0,
        }
      : undefined;

    await logWhatsAppEvent({
      action: "wa_ficha_ai",
      message: `IA preencheu a ficha: ${Object.keys(updates).join(", ")}`,
      authorId: "whatsapp-bot",
      authorName: "🤖 Bot WhatsApp",
      contactId,
      contactName: updates.name ?? contact.name,
      contactPhone: contact.phone,
      metadata: { fields: updates, usage },
    });

    return { filled: Object.keys(updates) };
  } catch (err) {
    console.error("[WHATSAPP FICHA-AI] Falha ao preencher a ficha:", contactId, err);
    // Falha também vira log (visível na Atividade do dashboard) — antes só
    // aparecia no console efêmero da Vercel e o recurso "morria em silêncio".
    const detail = err instanceof Error ? err.message : String(err);
    try {
      await logWhatsAppEvent({
        action: "wa_ficha_ai",
        message: `IA falhou ao preencher a ficha: ${detail.slice(0, 200)}`,
        authorId: "whatsapp-bot",
        authorName: "🤖 Bot WhatsApp",
        contactId,
        metadata: { error: detail },
      });
    } catch { /* log é best-effort */ }
    return { filled: [], reason: detail };
  }
}

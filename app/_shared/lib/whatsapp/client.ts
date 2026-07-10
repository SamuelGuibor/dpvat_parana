import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// Cliente da WhatsApp Cloud API (Meta oficial).
//
// Wrapper fino sobre a Graph API, no mesmo espírito do chat-relay.ts: fetch
// puro, sem lib de terceiro. Quem persiste no banco é quem chama (webhook,
// server action, automação) — aqui só falamos com a Meta e com o S3.
//
// Env vars (Vercel):
//   WHATSAPP_TOKEN            token permanente de System User do Business Manager
//   WHATSAPP_PHONE_NUMBER_ID  id do número no painel do WhatsApp Business
//   WHATSAPP_API_VERSION      opcional, default v21.0

const TOKEN = process.env.WHATSAPP_TOKEN ?? "";
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
const API_VERSION = process.env.WHATSAPP_API_VERSION ?? "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${API_VERSION}`;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export function isWhatsAppConfigured(): boolean {
  return !!TOKEN && !!PHONE_NUMBER_ID;
}

interface SendResult {
  waMessageId: string | null;
  error?: string;
}

interface SendResultRaw extends SendResult {
  errorCode?: number;
}

async function postMessageRaw(payload: Record<string, unknown>): Promise<SendResultRaw> {
  if (!isWhatsAppConfigured()) {
    return { waMessageId: null, error: "WhatsApp Cloud API não configurada (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)." };
  }
  try {
    const res = await fetch(`${GRAPH_BASE}/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.error?.message ?? `HTTP ${res.status}`;
      console.error("[WHATSAPP] Erro ao enviar mensagem:", msg, data?.error?.code ? `(code ${data.error.code})` : "");
      return { waMessageId: null, error: msg, errorCode: Number(data?.error?.code) || undefined };
    }
    return { waMessageId: data?.messages?.[0]?.id ?? null };
  } catch (err) {
    console.error("[WHATSAPP] Falha de rede ao enviar mensagem:", err);
    return { waMessageId: null, error: String(err) };
  }
}

async function postMessage(payload: Record<string, unknown>): Promise<SendResult> {
  const { waMessageId, error } = await postMessageRaw(payload);
  return { waMessageId, error };
}

/**
 * Texto livre — só funciona dentro da janela de 24h desde a última mensagem
 * do cliente. `replyToWaId` transforma em resposta (quote) no celular dele.
 */
export function sendText(phone: string, body: string, replyToWaId?: string): Promise<SendResult> {
  return postMessage({
    to: phone,
    type: "text",
    text: { body, preview_url: false },
    ...(replyToWaId ? { context: { message_id: replyToWaId } } : {}),
  });
}

/**
 * Mídia por URL pública (usamos presigned GET do S3): a Meta baixa o arquivo
 * e entrega ao cliente. Também só funciona dentro da janela de 24h.
 * Áudio .ogg (opus) aparece como mensagem de voz; mp3/aac como player de áudio.
 */
export function sendMedia(
  phone: string,
  kind: "image" | "video" | "audio" | "document",
  link: string,
  caption?: string,
  filename?: string,
  replyToWaId?: string,
): Promise<SendResult> {
  const media: Record<string, unknown> = { link };
  if (caption && kind !== "audio") media.caption = caption;
  if (filename && kind === "document") media.filename = filename;
  return postMessage({
    to: phone,
    type: kind,
    [kind]: media,
    ...(replyToWaId ? { context: { message_id: replyToWaId } } : {}),
  });
}

// Erros mais comuns da Graph API ao enviar template, traduzidos pra equipe.
// https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
const TEMPLATE_ERROR_HINTS: Record<number, string> = {
  132000: "O número de variáveis enviado não bate com o template aprovado na Meta. Sincronize os templates e tente de novo.",
  132001: "Template não existe na Meta com esse nome/idioma. Confira o nome exato e o código do idioma (ex.: pt_BR).",
  132005: "O texto do template na Meta ainda está pendente de aprovação.",
  132007: "O template foi reprovado ou pausado pela Meta — não pode ser enviado.",
  132012: "Formato de variável inválido para este template (a Meta rejeitou o conteúdo de uma variável).",
  132015: "O template está pausado pela Meta por baixa qualidade.",
  131026: "Este número não pode receber a mensagem (pode ter bloqueado a empresa ou não usa WhatsApp).",
  131047: "Janela de 24h expirada e a mensagem não é um template válido.",
  131048: "Limite de envios atingido (rate limit da Meta para esse número).",
};

/**
 * Template pré-aprovado na Meta — único jeito de iniciar conversa fora da
 * janela de 24h (usado pelas automações do kanban).
 *
 * O payload segue exatamente o que a Cloud API aceita: `components` só é
 * enviado quando há variáveis, e cada variável vira `{type:"text", text}`
 * posicional no corpo. Quebras de linha, tab e 4+ espaços seguidos são
 * proibidos pela Meta DENTRO de variável — sanitizamos aqui.
 */
export async function sendTemplate(
  phone: string,
  templateName: string,
  vars: string[] = [],
  language = "pt_BR",
): Promise<SendResult> {
  // A Meta rejeita variáveis com \n, \t ou 4+ espaços consecutivos (erro 132012).
  const cleanVars = vars.map((v) => v.replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim());

  const result = await postMessageRaw({
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      ...(cleanVars.length
        ? { components: [{ type: "body", parameters: cleanVars.map((v) => ({ type: "text", text: v })) }] }
        : {}),
    },
  });

  if (result.errorCode && TEMPLATE_ERROR_HINTS[result.errorCode]) {
    return { waMessageId: null, error: TEMPLATE_ERROR_HINTS[result.errorCode] };
  }
  return { waMessageId: result.waMessageId, error: result.error };
}

// ---------------------------------------------------------------------------
// Templates aprovados na Meta (fonte da verdade): lista via Graph API para o
// cadastro local nunca divergir do que a Meta realmente aceita.
// Requer WHATSAPP_WABA_ID (id da conta WhatsApp Business, não o do número).
// ---------------------------------------------------------------------------

export interface MetaTemplate {
  name: string;
  language: string;
  status: string; // APPROVED | PENDING | REJECTED | PAUSED ...
  bodyText: string | null;
  bodyVars: number;
}

export async function fetchApprovedTemplates(): Promise<MetaTemplate[]> {
  const wabaId = process.env.WHATSAPP_WABA_ID ?? "";
  if (!TOKEN || !wabaId) {
    throw new Error("Sincronização indisponível: configure WHATSAPP_WABA_ID (id da conta WhatsApp Business) no ambiente.");
  }

  const templates: MetaTemplate[] = [];
  let url: string | null =
    `${GRAPH_BASE}/${wabaId}/message_templates?fields=name,status,language,components&limit=100`;

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error?.message ?? `Meta respondeu HTTP ${res.status} ao listar templates.`);
    }

    for (const t of data?.data ?? []) {
      const body = (t.components ?? []).find((c: { type?: string }) => c.type === "BODY");
      const bodyText: string | null = body?.text ?? null;
      // Conta as variáveis posicionais {{1}} {{2}}... do corpo aprovado.
      const varNumbers = new Set<string>();
      for (const m of (bodyText ?? "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)) varNumbers.add(m[1]);
      templates.push({
        name: t.name,
        language: t.language,
        status: t.status,
        bodyText,
        bodyVars: varNumbers.size,
      });
    }

    url = data?.paging?.next ?? null;
  }

  return templates;
}

/**
 * Baixa uma mídia recebida (imagem/áudio/documento) e sobe pro S3 no mesmo
 * bucket dos documentos. A URL da Meta expira em ~5 min, por isso o download
 * acontece na hora do webhook. Retorna a chave no S3 ou null em caso de erro
 * (a mensagem é gravada mesmo assim, só sem o anexo).
 */
export async function downloadMediaToS3(
  mediaId: string,
  contactId: string,
  filenameHint?: string,
): Promise<{ key: string; mimeType: string } | null> {
  try {
    // 1. Resolve o media id para uma URL temporária.
    const metaRes = await fetch(`${GRAPH_BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: "no-store",
    });
    if (!metaRes.ok) throw new Error(`metadata HTTP ${metaRes.status}`);
    const meta = await metaRes.json();
    if (!meta?.url) throw new Error("resposta sem url de mídia");

    // 2. Baixa o binário (a URL exige o mesmo Bearer token).
    const binRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      cache: "no-store",
    });
    if (!binRes.ok) throw new Error(`download HTTP ${binRes.status}`);
    const buf = Buffer.from(await binRes.arrayBuffer());

    const mimeType: string = meta.mime_type ?? "application/octet-stream";
    const ext = mimeType.split("/")[1]?.split(";")[0] ?? "bin";
    const safeName = (filenameHint ?? `midia.${ext}`).replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `whatsapp/${contactId}/${Date.now()}-${safeName}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: key,
        Body: buf,
        ContentType: mimeType,
      }),
    );

    return { key, mimeType };
  } catch (err) {
    console.error(`[WHATSAPP] Falha ao baixar mídia ${mediaId}:`, err);
    return null;
  }
}

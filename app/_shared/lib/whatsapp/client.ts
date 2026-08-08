import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getCreds, type WaCreds } from "./numbers";

// Cliente da WhatsApp Cloud API (Meta oficial).
//
// Wrapper fino sobre a Graph API, no mesmo espírito do chat-relay.ts: fetch
// puro, sem lib de terceiro. Quem persiste no banco é quem chama (webhook,
// server action, automação) — aqui só falamos com a Meta e com o S3.
//
// MULTI-NÚMERO (07/08/2026): as credenciais deixaram de ser constantes de
// módulo — cada função aceita um `numberId` (WhatsAppNumber.id) opcional e
// resolve token/phone_number_id via numbers.ts. Sem numberId → número default
// (linha isDefault do banco, ou as envs WHATSAPP_* legadas).

function graphBase(c: WaCreds): string {
  return `https://graph.facebook.com/${c.apiVersion}`;
}

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export function isWhatsAppConfigured(): boolean {
  // Configurado = envs legadas presentes. Números cadastrados pela tela têm
  // credencial própria no banco e não dependem deste check (o getCreds
  // devolve null quando não há credencial nenhuma).
  return !!process.env.WHATSAPP_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID;
}

interface SendResult {
  waMessageId: string | null;
  error?: string;
}

interface SendResultRaw extends SendResult {
  errorCode?: number;
}

async function postMessageRaw(payload: Record<string, unknown>, numberId?: string | null): Promise<SendResultRaw> {
  const c = await getCreds(numberId);
  if (!c) {
    return { waMessageId: null, error: "WhatsApp Cloud API não configurada (cadastre um número ou WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)." };
  }
  try {
    const res = await fetch(`${graphBase(c)}/${c.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.token}`,
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

async function postMessage(payload: Record<string, unknown>, numberId?: string | null): Promise<SendResult> {
  const { waMessageId, error } = await postMessageRaw(payload, numberId);
  return { waMessageId, error };
}

/**
 * Marca uma mensagem RECEBIDA como lida no celular do cliente (tique azul).
 * Com `typing=true` também liga o indicador "digitando..." por até 25s —
 * usamos enquanto o bot prepara a resposta, pra parecer um atendente real.
 * Best-effort: falha aqui nunca interrompe o fluxo de quem chamou.
 */
export async function markMessageRead(waMessageId: string, typing = false, numberId?: string | null): Promise<void> {
  if (!waMessageId) return;
  const c = await getCreds(numberId);
  if (!c) return;
  try {
    const res = await fetch(`${graphBase(c)}/${c.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.token}`,
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: waMessageId,
        ...(typing ? { typing_indicator: { type: "text" } } : {}),
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      console.warn("[WHATSAPP] Falha ao marcar como lida:", data?.error?.message ?? `HTTP ${res.status}`);
    }
  } catch (err) {
    console.warn("[WHATSAPP] Falha de rede ao marcar como lida:", err);
  }
}

/**
 * Texto livre — só funciona dentro da janela de 24h desde a última mensagem
 * do cliente. `replyToWaId` transforma em resposta (quote) no celular dele.
 */
export function sendText(phone: string, body: string, replyToWaId?: string, numberId?: string | null): Promise<SendResult> {
  return postMessage({
    to: phone,
    type: "text",
    text: { body, preview_url: false },
    ...(replyToWaId ? { context: { message_id: replyToWaId } } : {}),
  }, numberId);
}

/**
 * Mídia por URL pública (usamos presigned GET do S3): a Meta baixa o arquivo
 * e entrega ao cliente. Também só funciona dentro da janela de 24h.
 * ATENÇÃO: áudio por link SEMPRE chega como player de arquivo — para chegar
 * como mensagem de voz (PTT) use sendVoiceNote (upload + envio por media id).
 */
export function sendMedia(
  phone: string,
  kind: "image" | "video" | "audio" | "document",
  link: string,
  caption?: string,
  filename?: string,
  replyToWaId?: string,
  numberId?: string | null,
): Promise<SendResult> {
  const media: Record<string, unknown> = { link };
  if (caption && kind !== "audio") media.caption = caption;
  if (filename && kind === "document") media.filename = filename;
  return postMessage({
    to: phone,
    type: kind,
    [kind]: media,
    ...(replyToWaId ? { context: { message_id: replyToWaId } } : {}),
  }, numberId);
}

/**
 * Sobe um binário no endpoint /media da Meta e retorna o media id.
 * Necessário para MENSAGEM DE VOZ: áudio ogg/opus enviado por `link` chega
 * como player de arquivo genérico; enviado por media `id` chega como voz
 * (bolha com forma de onda, "PTT"). A Meta só renderiza voz nesse caminho.
 */
async function uploadMediaFromUrl(link: string, mimeType: string, filename: string, numberId?: string | null): Promise<string | null> {
  const c = await getCreds(numberId);
  if (!c) return null;
  try {
    const bin = await fetch(link, { cache: "no-store" });
    if (!bin.ok) {
      console.error(`[WHATSAPP] Falha ao baixar mídia para upload (HTTP ${bin.status}).`);
      return null;
    }
    const buf = await bin.arrayBuffer();
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mimeType);
    form.append("file", new Blob([buf], { type: mimeType }), filename);
    const res = await fetch(`${graphBase(c)}/${c.phoneNumberId}/media`, {
      method: "POST",
      headers: { Authorization: `Bearer ${c.token}` },
      body: form,
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.error("[WHATSAPP] Erro no upload de mídia:", data?.error?.message ?? `HTTP ${res.status}`);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.error("[WHATSAPP] Falha de rede no upload de mídia:", err);
    return null;
  }
}

/**
 * Áudio como MENSAGEM DE VOZ (ogg/opus): baixa do link (presigned S3), sobe
 * no /media da Meta e envia por id com `voice: true` — é ESSE flag que faz a
 * Meta renderizar a bolha de voz (forma de onda/PTT) em vez do player de
 * arquivo. Se o upload falhar, tenta por link mantendo o flag.
 */
export async function sendVoiceNote(
  phone: string,
  link: string,
  filename = "audio.ogg",
  replyToWaId?: string,
  numberId?: string | null,
): Promise<SendResult> {
  const mediaId = await uploadMediaFromUrl(link, "audio/ogg", filename, numberId);
  return postMessage({
    to: phone,
    type: "audio",
    audio: { ...(mediaId ? { id: mediaId } : { link }), voice: true },
    ...(replyToWaId ? { context: { message_id: replyToWaId } } : {}),
  }, numberId);
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
  headerVar?: string | null,
  numberId?: string | null,
): Promise<SendResult> {
  // A Meta rejeita variáveis com \n, \t ou 4+ espaços consecutivos (erro 132012).
  const clean = (v: string) => v.replace(/[\n\t]+/g, " ").replace(/ {4,}/g, "   ").trim();
  const cleanVars = vars.map(clean);

  // Cabeçalho vem antes do corpo e é um componente próprio: sem ele, um
  // template com {{1}} no cabeçalho é recusado por nº de parâmetros.
  const components: Record<string, unknown>[] = [];
  if (headerVar?.trim()) {
    components.push({ type: "header", parameters: [{ type: "text", text: clean(headerVar) }] });
  }
  if (cleanVars.length) {
    components.push({ type: "body", parameters: cleanVars.map((v) => ({ type: "text", text: v })) });
  }

  const result = await postMessageRaw({
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: language },
      ...(components.length ? { components } : {}),
    },
  }, numberId);

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
  metaId: string | null;
  name: string;
  language: string;
  status: string; // APPROVED | PENDING | REJECTED | PAUSED ...
  category: string; // UTILITY | MARKETING | AUTHENTICATION
  headerText: string | null; // só cabeçalho de TEXTO; mídia vem como null
  bodyText: string | null;
  footerText: string | null;
  bodyVars: number;
  rejectedReason: string | null;
}

/** Conta as variáveis posicionais {{1}} {{2}}... de um corpo de template. */
export function countTemplateVars(bodyText: string | null | undefined): number {
  const varNumbers = new Set<string>();
  for (const m of (bodyText ?? "").matchAll(/\{\{\s*(\d+)\s*\}\}/g)) varNumbers.add(m[1]);
  return varNumbers.size;
}

/**
 * Lista os templates da conta com TODOS os status (não só os aprovados) — a
 * tela de templates acompanha o ciclo da Meta: em análise → aprovado/reprovado.
 */
export async function fetchMetaTemplates(numberId?: string | null): Promise<MetaTemplate[]> {
  const c = await getCreds(numberId);
  if (!c?.token || !c.wabaId) {
    throw new Error("Sincronização indisponível: cadastre a WABA do número (ou configure WHATSAPP_WABA_ID no ambiente).");
  }

  const templates: MetaTemplate[] = [];
  let url: string | null =
    `${graphBase(c)}/${c.wabaId}/message_templates?fields=id,name,status,category,language,components,rejected_reason&limit=100`;

  while (url) {
    const res: Response = await fetch(url, {
      headers: { Authorization: `Bearer ${c.token}` },
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.error?.message ?? `Meta respondeu HTTP ${res.status} ao listar templates.`);
    }

    for (const t of data?.data ?? []) {
      const components = (t.components ?? []) as { type?: string; format?: string; text?: string }[];
      const bodyText: string | null = components.find((c) => c.type === "BODY")?.text ?? null;
      const footerText: string | null = components.find((c) => c.type === "FOOTER")?.text ?? null;
      // Cabeçalho de mídia não tem `text` — fica null e a tela mostra só o corpo.
      const header = components.find((c) => c.type === "HEADER");
      const headerText: string | null = header?.format === "TEXT" ? header.text ?? null : null;
      // "NONE" é como a Meta diz "não foi reprovado" — não vira motivo na tela.
      const rejected = String(t.rejected_reason ?? "");
      templates.push({
        metaId: t.id ?? null,
        name: t.name,
        language: t.language,
        status: t.status,
        category: t.category ?? "UTILITY",
        headerText,
        bodyText,
        footerText,
        bodyVars: countTemplateVars(bodyText),
        rejectedReason: rejected && rejected !== "NONE" ? rejected : null,
      });
    }

    url = data?.paging?.next ?? null;
  }

  return templates;
}

/**
 * CRIA um template na Meta e o submete para aprovação. Diferente do resto do
 * cadastro (que só espelha), isto muda o estado lá: o template nasce PENDING e
 * a Meta responde em até ~24h (o webhook message_template_status_update avisa).
 *
 * A Meta exige um exemplo para CADA variável do corpo — sem isso a criação é
 * recusada na hora com "body_text example is required".
 */
export async function createMetaTemplate(input: {
  name: string;
  language: string;
  category: string;
  headerText?: string | null;
  headerExample?: string | null;
  bodyText: string;
  bodyExamples: string[];
  footerText?: string | null;
}, numberId?: string | null): Promise<{ metaId: string | null; status: string; error?: string }> {
  const c = await getCreds(numberId);
  if (!c?.token || !c.wabaId) {
    return { metaId: null, status: "", error: "Criação indisponível: cadastre a WABA do número (ou configure WHATSAPP_WABA_ID no ambiente)." };
  }

  const components: Record<string, unknown>[] = [];

  // O cabeçalho vem ANTES do corpo — a Meta valida a ordem dos componentes.
  // No header o exemplo é `example.header_text` (array simples), diferente do
  // corpo, que usa `body_text` (array de arrays).
  if (input.headerText?.trim()) {
    components.push({
      type: "HEADER",
      format: "TEXT",
      text: input.headerText.trim(),
      ...(input.headerExample?.trim() ? { example: { header_text: [input.headerExample.trim()] } } : {}),
    });
  }

  components.push({
    type: "BODY",
    text: input.bodyText,
    ...(input.bodyExamples.length ? { example: { body_text: [input.bodyExamples] } } : {}),
  });
  if (input.footerText?.trim()) {
    components.push({ type: "FOOTER", text: input.footerText.trim() });
  }

  try {
    const res = await fetch(`${graphBase(c)}/${c.wabaId}/message_templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${c.token}`,
      },
      body: JSON.stringify({
        name: input.name,
        language: input.language,
        category: input.category,
        components,
      }),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = data?.error?.error_user_msg ?? data?.error?.message ?? `Meta respondeu HTTP ${res.status}.`;
      console.error("[WHATSAPP TEMPLATES] Criação recusada pela Meta:", msg);
      return { metaId: null, status: "", error: msg };
    }
    return { metaId: data?.id ?? null, status: data?.status ?? "PENDING" };
  } catch (err) {
    console.error("[WHATSAPP TEMPLATES] Falha de rede ao criar template:", err);
    return { metaId: null, status: "", error: String(err) };
  }
}

/** Apaga o template NA META (some pra valer, não só do cadastro local). */
export async function deleteMetaTemplate(name: string, numberId?: string | null): Promise<{ error?: string }> {
  const c = await getCreds(numberId);
  if (!c?.token || !c.wabaId) return { error: "WABA não configurada para este número." };
  try {
    const res = await fetch(
      `${graphBase(c)}/${c.wabaId}/message_templates?name=${encodeURIComponent(name)}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${c.token}` }, cache: "no-store" },
    );
    const data = await res.json().catch(() => null);
    if (!res.ok) return { error: data?.error?.message ?? `Meta respondeu HTTP ${res.status}.` };
    return {};
  } catch (err) {
    return { error: String(err) };
  }
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
  numberId?: string | null,
): Promise<{ key: string; mimeType: string } | null> {
  try {
    const c = await getCreds(numberId);
    if (!c) throw new Error("sem credencial WhatsApp");
    // 1. Resolve o media id para uma URL temporária.
    const metaRes = await fetch(`${graphBase(c)}/${mediaId}`, {
      headers: { Authorization: `Bearer ${c.token}` },
      cache: "no-store",
    });
    if (!metaRes.ok) throw new Error(`metadata HTTP ${metaRes.status}`);
    const meta = await metaRes.json();
    if (!meta?.url) throw new Error("resposta sem url de mídia");

    // 2. Baixa o binário (a URL exige o mesmo Bearer token).
    const binRes = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${c.token}` },
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

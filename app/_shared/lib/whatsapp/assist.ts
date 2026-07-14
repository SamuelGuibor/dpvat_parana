import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/app/_shared/lib/prisma";
import { logWhatsAppEvent } from "@/app/_shared/lib/log";
import { findLinkedCard } from "./bot";

// Agent-assist: chamadas de IA que AJUDAM o atendente humano (não respondem
// sozinhas ao cliente). Todas usam o mesmo microserviço do bot (CHATBOT_URL):
//   - suggestReplyForContact  → propõe a próxima resposta (humano revisa/envia)
//   - summarizeConversation   → resumo curto do histórico (vira comentário no card)
//   - transcribeMessageAudio  → transcreve um áudio da thread (persiste na mensagem)
// O gasto de tokens vai pro log (wa_suggest / wa_summary) e entra na conta do
// dashboard "Desempenho do Chatbot".

const CHATBOT_URL = process.env.CHATBOT_URL?.replace(/\/$/, "") ?? "";
const CHATBOT_SECRET = process.env.CHATBOT_SECRET ?? "";
const ASSIST_TIMEOUT_MS = 30_000;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

function assistConfigured(): boolean {
  return !!CHATBOT_URL && !!CHATBOT_SECRET;
}

async function callAssist<T>(path: string, body: object): Promise<T> {
  if (!assistConfigured()) throw new Error("Serviço de IA não configurado (CHATBOT_URL/CHATBOT_SECRET).");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASSIST_TIMEOUT_MS);
  try {
    const res = await fetch(`${CHATBOT_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bot-secret": CHATBOT_SECRET },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`IA respondeu HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

interface HistoryTurn {
  role: "client" | "bot" | "agent";
  text: string;
}

/** Histórico recente da conversa no formato que o cérebro entende. */
async function loadHistory(contactId: string, take = 40): Promise<HistoryTurn[]> {
  const rows = await db.whatsAppMessage.findMany({
    where: { contactId, internal: false, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take,
    select: { direction: true, sentByBot: true, body: true, transcript: true, mediaType: true },
  });
  return rows
    .reverse()
    .map((m) => {
      // Áudio já transcrito entra como texto — melhora sugestão e resumo.
      const text = m.body?.trim()
        ? m.body
        : m.transcript
          ? `[áudio] ${m.transcript}`
          : m.mediaType
            ? "📎 (anexo)"
            : "";
      if (!text) return null;
      return {
        role: (m.direction === "in" ? "client" : m.sentByBot ? "bot" : "agent") as HistoryTurn["role"],
        text,
      };
    })
    .filter((t): t is HistoryTurn => !!t);
}

// ---------------------------------------------------------------------------
// Sugestão de resposta (IA propõe → humano aprova/edita → envia)
// ---------------------------------------------------------------------------
export async function suggestReplyForContact(
  contactId: string,
  agent: { id: string; name: string },
): Promise<string> {
  const contact = await db.whatsAppContact.findUnique({
    where: { id: contactId },
    select: { name: true, phone: true },
  });
  if (!contact) throw new Error("Contato não encontrado.");

  const [history, conversation, card] = await Promise.all([
    loadHistory(contactId),
    db.whatsAppConversation.findUnique({ where: { contactId }, select: { botMemory: true } }),
    findLinkedCard(contactId).catch(() => null),
  ]);

  const out = await callAssist<{ suggestion: string; usage?: object | null }>("/suggest", {
    contact: { name: contact.name, phone: contact.phone },
    processInfo: card ? { name: card.name, etapa: card.etapa, service: card.service } : null,
    history,
    memory: conversation?.botMemory ?? null,
    agentName: agent.name,
  });

  await logWhatsAppEvent({
    action: "wa_suggest",
    message: "pediu sugestão de resposta à IA",
    authorId: agent.id,
    authorName: agent.name,
    contactId,
    contactName: contact.name,
    contactPhone: contact.phone,
    metadata: { usage: out.usage ?? undefined },
  });

  return out.suggestion;
}

// ---------------------------------------------------------------------------
// Resumo da conversa → comentário no card do kanban (dispara ao VINCULAR o
// contato a um User/Process). Best-effort: falha aqui nunca quebra o vínculo.
// ---------------------------------------------------------------------------
export async function summarizeConversationToCard(
  contactId: string,
  target: { userId?: string; processId?: string },
  author: { id: string; name: string },
): Promise<void> {
  try {
    if (!assistConfigured()) return;
    if (!target.userId && !target.processId) return;

    const contact = await db.whatsAppContact.findUnique({
      where: { id: contactId },
      select: { name: true, phone: true },
    });
    if (!contact) return;

    const [history, conversation] = await Promise.all([
      loadHistory(contactId, 60),
      db.whatsAppConversation.findUnique({ where: { contactId }, select: { botMemory: true } }),
    ]);
    // Sem conversa não há o que resumir.
    if (!history.length) return;

    const cardName = target.userId
      ? (await db.user.findUnique({ where: { id: target.userId }, select: { name: true } }))?.name
      : (await db.process.findUnique({ where: { id: target.processId! }, select: { name: true } }))?.name;

    const out = await callAssist<{ summary: string; usage?: object | null }>("/summarize", {
      contact: { name: contact.name, phone: contact.phone },
      history,
      memory: conversation?.botMemory ?? null,
    });

    await db.comment.create({
      data: {
        text: `🤖 Resumo da conversa de WhatsApp (+${contact.phone}):\n\n${out.summary}`,
        authorName: "🤖 IA — WhatsApp",
        targetName: cardName ?? contact.name ?? `+${contact.phone}`,
        userId: target.userId ?? null,
        processId: target.processId ?? null,
      },
    });

    await logWhatsAppEvent({
      action: "wa_summary",
      message: "IA resumiu a conversa no card do cliente",
      authorId: author.id,
      authorName: author.name,
      contactId,
      contactName: contact.name,
      contactPhone: contact.phone,
      metadata: { usage: out.usage ?? undefined, userId: target.userId, processId: target.processId },
    });
  } catch (err) {
    console.error("[WHATSAPP ASSIST] Falha ao resumir conversa pro card:", contactId, err);
  }
}

// ---------------------------------------------------------------------------
// Transcrição de áudio sob demanda (botão "transcrever" do inbox). O resultado
// é PERSISTIDO na mensagem — o segundo clique (de qualquer atendente) é grátis.
// ---------------------------------------------------------------------------
export async function transcribeMessageAudio(
  messageId: string,
  agent: { id: string; name: string },
): Promise<string> {
  const message = await db.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: { id: true, contactId: true, mediaKey: true, mediaType: true, transcript: true },
  });
  if (!message) throw new Error("Mensagem não encontrada.");
  if (message.transcript) return message.transcript; // já transcrito
  if (!message.mediaKey || !message.mediaType?.startsWith("audio/")) {
    throw new Error("Esta mensagem não tem áudio para transcrever.");
  }

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: message.mediaKey }),
    { expiresIn: 600 },
  );

  const out = await callAssist<{ transcript: string }>("/transcribe", {
    url,
    mimeType: message.mediaType,
  });
  const transcript = out.transcript?.trim();
  if (!transcript) throw new Error("A IA não conseguiu transcrever este áudio.");

  await db.whatsAppMessage.update({
    where: { id: messageId },
    data: { transcript },
  });

  const contact = await db.whatsAppContact.findUnique({
    where: { id: message.contactId },
    select: { name: true, phone: true },
  });
  await logWhatsAppEvent({
    action: "wa_transcribe",
    message: "transcreveu um áudio da conversa",
    authorId: agent.id,
    authorName: agent.name,
    contactId: message.contactId,
    contactName: contact?.name,
    contactPhone: contact?.phone,
  });

  return transcript;
}

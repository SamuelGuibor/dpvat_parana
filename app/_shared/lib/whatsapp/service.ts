import { db } from "@/app/_shared/lib/prisma";
import { broadcastToRelay } from "@/app/_shared/lib/chat-relay";
import { downloadMediaToS3 } from "./client";

// Ingestão de eventos do webhook da WhatsApp Cloud API.
//
// Cada conversa de WhatsApp vira um "canal" no relay SSE já existente
// (channelId = "whatsapp:<contactId>"), então os funcionários com a tela
// aberta recebem em tempo real sem nenhuma mudança no relay do Railway.

// Mesma convenção de equipe do chat interno (chat-access.ts / api/presence).
const TEAM_ROLES = ["ADMIN", "ADMIN+", "ADMIN++"];

export function whatsappChannelId(contactId: string): string {
  return `whatsapp:${contactId}`;
}

/** Todos os membros da equipe recebem o broadcast (a UI filtra por conversa). */
export async function whatsappRecipients(): Promise<string[]> {
  const team = await db.user.findMany({
    where: { role: { in: TEAM_ROLES } },
    select: { id: true },
  });
  return team.map((u) => u.id);
}

export interface WhatsAppMessageDTO {
  id: string;
  channelId: string;
  contactId: string;
  // id da Meta (mensagens recebidas) — o bot usa pra marcar como lida/digitando.
  waMessageId?: string | null;
  direction: string;
  body: string | null;
  mediaKey: string | null;
  mediaType: string | null;
  status: string;
  sentByBot: boolean;
  authorId: string | null;
  createdAt: string;
  contactName: string | null;
  contactPhone: string;
  conversationStatus: string;
  replyToId?: string | null;
  replyToBody?: string | null;
  replyToDirection?: string | null;
}

// Formato relevante de uma mensagem no payload do webhook da Meta
// (entry[].changes[].value.messages[]).
export interface IncomingWaMessage {
  id: string;
  from: string; // telefone E.164 sem "+"
  timestamp?: string;
  type: string; // text | image | audio | document | video | sticker | button | interactive | ...
  text?: { body?: string };
  image?: { id?: string; caption?: string; mime_type?: string };
  audio?: { id?: string; mime_type?: string };
  video?: { id?: string; caption?: string; mime_type?: string };
  document?: { id?: string; caption?: string; filename?: string; mime_type?: string };
  sticker?: { id?: string; mime_type?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  // Presente quando o cliente RESPONDE (quote) uma mensagem.
  context?: { id?: string };
}

function extractBody(msg: IncomingWaMessage): string | null {
  switch (msg.type) {
    case "text":        return msg.text?.body ?? null;
    case "image":       return msg.image?.caption ?? null;
    case "video":       return msg.video?.caption ?? null;
    case "document":    return msg.document?.caption ?? null;
    case "button":      return msg.button?.text ?? null;
    case "interactive": return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? null;
    default:            return null;
  }
}

function extractMediaId(msg: IncomingWaMessage): { id: string; filename?: string } | null {
  const media = msg.image ?? msg.audio ?? msg.video ?? msg.document ?? msg.sticker;
  if (!media?.id) return null;
  return { id: media.id, filename: msg.document?.filename };
}

export interface IngestResult {
  contactId: string;
  conversationStatus: string;
  message: WhatsAppMessageDTO;
  isNew: boolean; // false quando é retry da Meta (waMessageId já existia)
}

/**
 * Processa uma mensagem recebida: upsert de contato + conversa, dedup por
 * waMessageId (a Meta reenvia o webhook se não receber 200 a tempo), download
 * de mídia pro S3 e broadcast pro relay SSE.
 */
export async function ingestIncomingMessage(
  msg: IncomingWaMessage,
  profileName?: string,
): Promise<IngestResult | null> {
  // Dedup: retry de webhook não gera mensagem nova nem re-dispara o bot.
  const existing = await db.whatsAppMessage.findUnique({
    where: { waMessageId: msg.id },
    select: { id: true },
  });

  const contact = await db.whatsAppContact.upsert({
    where: { phone: msg.from },
    update: profileName ? { name: profileName } : {},
    create: { phone: msg.from, name: profileName ?? null },
  });

  // Cliente respondeu → zera os marcadores de silêncio do bot (30min/24h).
  let conversation = await db.whatsAppConversation.upsert({
    where: { contactId: contact.id },
    update: { lastMessageAt: new Date(), botNudge30At: null, botNudge24At: null },
    create: { contactId: contact.id },
  });

  // Conversa encerrada + cliente mandou mensagem de novo → reabre (volta pro
  // bot, sem atendente). Ela some de "Encerradas" e o bot/fila retoma o fluxo.
  if (conversation.status === "closed") {
    conversation = await db.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { status: "bot", assignedToId: null, lastReadAt: null },
    });
  }

  if (existing) {
    return null;
  }

  // Mídia: baixa antes de gravar (a URL da Meta expira rápido). Se falhar,
  // grava a mensagem sem anexo — melhor do que perder o evento.
  let mediaKey: string | null = null;
  let mediaType: string | null = null;
  const media = extractMediaId(msg);
  if (media) {
    const stored = await downloadMediaToS3(media.id, contact.id, media.filename);
    if (stored) {
      mediaKey = stored.key;
      mediaType = stored.mimeType;
    }
  }

  // Cliente respondeu (quote) uma mensagem? Resolve o waMessageId pro nosso id
  // e guarda um snapshot do texto pro render ficar estável.
  let replyTo: { id: string; body: string | null; direction: string } | null = null;
  if (msg.context?.id) {
    replyTo = await db.whatsAppMessage.findUnique({
      where: { waMessageId: msg.context.id },
      select: { id: true, body: true, direction: true },
    });
  }

  const message = await db.whatsAppMessage.create({
    data: {
      contactId: contact.id,
      waMessageId: msg.id,
      direction: "in",
      body: extractBody(msg),
      mediaKey,
      mediaType,
      status: "delivered",
      replyToId: replyTo?.id ?? null,
      replyToBody: replyTo ? replyTo.body ?? "📎 Anexo" : null,
      replyToDirection: replyTo?.direction ?? null,
    },
  });

  const dto: WhatsAppMessageDTO = {
    id: message.id,
    channelId: whatsappChannelId(contact.id),
    contactId: contact.id,
    waMessageId: message.waMessageId,
    direction: message.direction,
    body: message.body,
    mediaKey: message.mediaKey,
    mediaType: message.mediaType,
    status: message.status,
    sentByBot: false,
    authorId: null,
    createdAt: message.createdAt.toISOString(),
    contactName: contact.name,
    contactPhone: contact.phone,
    conversationStatus: conversation.status,
    replyToId: message.replyToId,
    replyToBody: message.replyToBody,
    replyToDirection: message.replyToDirection,
  };

  // Best-effort, igual ao chat interno: se o relay estiver fora, o polling cobre.
  const recipients = await whatsappRecipients();
  await broadcastToRelay({ channelId: dto.channelId, recipients, message: dto });

  return { contactId: contact.id, conversationStatus: conversation.status, message: dto, isNew: true };
}

// Status de entrega reportado pela Meta (entry[].changes[].value.statuses[]).
export interface IncomingWaStatus {
  id: string; // waMessageId da mensagem enviada por nós
  status: string; // sent | delivered | read | failed
}

/** Atualiza o status de entrega de uma mensagem enviada (out). */
export async function applyStatusUpdate(st: IncomingWaStatus): Promise<void> {
  if (!["sent", "delivered", "read", "failed"].includes(st.status)) return;
  try {
    await db.whatsAppMessage.update({
      where: { waMessageId: st.id },
      data: { status: st.status },
    });
  } catch {
    // Mensagem não encontrada (ex: enviada fora do sistema) — ignora.
  }
}

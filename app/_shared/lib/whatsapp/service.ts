import type { WhatsAppConversation, WhatsAppContact } from "@prisma/client";
import { db } from "@/app/_shared/lib/prisma";
import { broadcastToRelay } from "@/app/_shared/lib/chat-relay";
import { downloadMediaToS3, sendText } from "./client";
import { isOptOutMessage, isOptInMessage, OPT_OUT_CONFIRMATION } from "./opt-out";

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

  // Opt-out / opt-in (anti-spam): analisa o texto do cliente cedo.
  const incomingText = extractBody(msg);
  const wantsOptOut = isOptOutMessage(incomingText);
  const wantsOptIn = isOptInMessage(incomingText);

  // Reativação explícita: quem estava opt-out pediu para voltar a ser atendido.
  if (contact.optedOut && wantsOptIn && !wantsOptOut) {
    await db.whatsAppContact.update({ where: { id: contact.id }, data: { optedOut: false } });
    contact.optedOut = false;
  }

  // Conversa encerrada + cliente mandou mensagem de novo → reabre (volta pro
  // bot, sem atendente). NÃO reabre se o contato está em opt-out: quem pediu
  // silêncio não deve voltar a receber respostas automáticas.
  if (conversation.status === "closed" && !contact.optedOut && !wantsOptOut) {
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

  // Opt-out por REGEX: só atua quando NÃO está em modo bot (fila/humano), onde
  // não há IA para julgar o contexto. Em modo bot, deixamos a mensagem seguir
  // para o cérebro, que decide o opt-out lendo a conversa inteira (evita tratar
  // "vou precisar sair, mas já volto" como um comando de descadastro). O regex
  // aqui é conservador: só casa frases explícitas de descadastro.
  if (wantsOptOut && conversation.status !== "bot") {
    if (!contact.optedOut) {
      try {
        const confirm = await sendText(contact.phone, OPT_OUT_CONFIRMATION);
        if (confirm.waMessageId) {
          await db.whatsAppMessage.create({
            data: {
              contactId: contact.id, waMessageId: confirm.waMessageId,
              direction: "out", body: OPT_OUT_CONFIRMATION, status: "sent", sentByBot: true,
            },
          });
        }
      } catch (err) {
        console.error("[WHATSAPP] Falha ao confirmar opt-out:", contact.id, err);
      }
    }
    await db.whatsAppContact.update({ where: { id: contact.id }, data: { optedOut: true } });
    conversation = await db.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { status: "closed", assignedToId: null, closeCategory: "nao_qualificado", botMemory: null, botState: null },
    });
    return { contactId: contact.id, conversationStatus: "closed", message: dto, isNew: true };
  }

  // Notificação (sino) do "cliente respondeu": NUNCA para todo mundo quando
  // já existe um dono do ticket — só a fila de distribuição (sem atendente)
  // justifica avisar a equipe inteira. Conversa em modo "bot" não notifica
  // aqui: se a IA decidir escalar, o próprio handoff cria a notificação certa.
  await notifyIncomingMessage(conversation, contact, message.id, dto.body, mediaType);

  return { contactId: contact.id, conversationStatus: conversation.status, message: dto, isNew: true };
}

/**
 * Notificação (sino) do "cliente respondeu" — política de destinatário:
 *   - conversa "queued" (ninguém assumiu ainda) → toda a equipe pode pegar,
 *     então TODOS recebem (é a fila de distribuição).
 *   - conversa "human" com dono (assignedToId) → SÓ o dono é avisado.
 *   - conversa "bot" → não notifica aqui; se a IA escalar, handoffToQueue/
 *     qualifyToQueue já criam a notificação certa depois de decidir.
 * Debounce leve (3min) por destinatário pra não inundar o sino quando o
 * cliente manda várias mensagens em sequência.
 */
async function notifyIncomingMessage(
  conversation: WhatsAppConversation,
  contact: WhatsAppContact,
  messageId: string,
  body: string | null,
  mediaType: string | null,
): Promise<void> {
  if (conversation.status !== "queued" && conversation.status !== "human") return;
  if (conversation.status === "human" && !conversation.assignedToId) return;

  try {
    const recipientIds = conversation.status === "human"
      ? [conversation.assignedToId as string]
      : await whatsappRecipients();
    if (!recipientIds.length) return;

    const label = contact.name ?? `+${contact.phone}`;
    const preview = body ? body.slice(0, 80) : mediaType ? "📎 Anexo" : "mensagem";
    const message = conversation.status === "human"
      ? `${label} respondeu: ${preview}`
      : `${label} está aguardando na fila: ${preview}`;

    for (const recipientId of recipientIds) {
      const recent = await db.notification.findFirst({
        where: { recipientId, contactId: contact.id, read: false, createdAt: { gte: new Date(Date.now() - 3 * 60_000) } },
        select: { id: true },
      });
      if (recent) continue; // já tem aviso fresco pendente pra esse destinatário

      await db.notification.create({
        data: {
          recipientId,
          authorId: "whatsapp-client",
          authorName: label,
          targetName: label,
          message,
          contactId: contact.id,
        },
      });
    }
  } catch (err) {
    console.error("[WHATSAPP] Falha ao notificar mensagem recebida:", messageId, err);
  }
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

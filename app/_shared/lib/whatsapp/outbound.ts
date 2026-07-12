import { db } from "@/app/_shared/lib/prisma";
import { Prisma } from "@prisma/client";
import { broadcastToRelay } from "@/app/_shared/lib/chat-relay";
import { logWhatsAppEvent } from "@/app/_shared/lib/log";
import { sendText, sendTemplate } from "./client";
import { OPT_OUT_FOOTER } from "./opt-out";
import { whatsappChannelId, whatsappRecipients, type WhatsAppMessageDTO } from "./service";

// Envio de mensagens de SISTEMA pro WhatsApp do cliente — usado pelas
// automações do kanban (card entrou numa coluna) e pelo checklist de
// progresso do card (status avançou).
//
// Regra da Meta respeitada aqui:
//   - Janela de 24h ABERTA (cliente mandou mensagem nas últimas 24h)
//     → pode texto livre.
//   - Janela EXPIRADA → só template aprovado na Meta. Se nenhum template
//     estiver configurado, o envio é pulado (registramos no log o motivo).

/** Normaliza telefone BR para o formato E.164 sem "+" (55 + DDD + número). */
export function normalizePhoneBR(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  // Remove zeros de operadora à esquerda (ex: 041...).
  digits = digits.replace(/^0+/, "");
  if (!digits.startsWith("55")) digits = `55${digits}`;
  // 55 + DDD(2) + número(8 ou 9)
  if (digits.length < 12 || digits.length > 13) return null;
  return digits;
}

/**
 * Resolve o contato do WhatsApp a partir do telefone do card. Primeiro tenta
 * casar com um contato existente pelos últimos 8 dígitos (cobre máscara e o
 * 9º dígito); se não existir, cria um contato novo com o número normalizado.
 */
export async function findOrCreateContactByPhone(
  rawPhone: string,
  name?: string | null,
): Promise<{ id: string; phone: string; name: string | null; optedOut: boolean; optedInAt: Date | null } | null> {
  const digits = rawPhone.replace(/\D/g, "");
  const last8 = digits.slice(-8);
  if (last8.length < 8) return null;

  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT id FROM "whatsapp_contacts"
    WHERE right(regexp_replace(phone, '\\D', '', 'g'), 8) = ${last8}
    LIMIT 1
  `);
  if (rows.length) {
    return db.whatsAppContact.findUnique({
      where: { id: rows[0].id },
      select: { id: true, phone: true, name: true, optedOut: true, optedInAt: true },
    });
  }

  const normalized = normalizePhoneBR(rawPhone);
  if (!normalized) return null;
  const created = await db.whatsAppContact.upsert({
    where: { phone: normalized },
    update: {},
    create: { phone: normalized, name: name ?? null },
  });
  return { id: created.id, phone: created.phone, name: created.name, optedOut: created.optedOut, optedInAt: created.optedInAt };
}

/** Janela de 24h da Meta: aberta se o CLIENTE mandou mensagem nas últimas 24h. */
export async function isWindowOpen(contactId: string): Promise<boolean> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const lastInbound = await db.whatsAppMessage.findFirst({
    where: { contactId, direction: "in", createdAt: { gte: since } },
    select: { id: true },
  });
  return !!lastInbound;
}

// Cap de frequência anti-spam: no máximo 1 mensagem PROATIVA (automação ou
// progresso) por contato dentro desta janela. Rajada de avisos idênticos é o
// padrão que o classificador de spam da Meta procura.
const SYSTEM_COOLDOWN_MS =
  Number(process.env.WHATSAPP_SYSTEM_COOLDOWN_HOURS ?? 6) * 60 * 60_000;

// Depois de N proativas seguidas sem NENHUMA resposta do cliente, a equipe é
// alertada (contato por outro canal?) — quem nunca responde é quem denuncia.
// O envio NÃO é bloqueado; o alerta dispara uma única vez, ao cruzar o limiar.
const UNANSWERED_ALERT_THRESHOLD = 3;

/** Persiste a mensagem enviada pelo sistema e transmite pro inbox da equipe. */
async function persistSystemMessage(
  contact: { id: string; phone: string; name: string | null },
  waMessageId: string,
  body: string,
  systemSource: string,
): Promise<void> {
  const message = await db.whatsAppMessage.create({
    data: {
      contactId: contact.id,
      waMessageId,
      direction: "out",
      body,
      status: "sent",
      sentByBot: true,
      systemSource,
    },
  });
  const conversation = await db.whatsAppConversation.upsert({
    where: { contactId: contact.id },
    update: { lastMessageAt: new Date() },
    create: { contactId: contact.id },
  });

  const dto: WhatsAppMessageDTO = {
    id: message.id,
    channelId: whatsappChannelId(contact.id),
    contactId: contact.id,
    direction: "out",
    body,
    mediaKey: null,
    mediaType: null,
    status: "sent",
    sentByBot: true,
    authorId: null,
    createdAt: message.createdAt.toISOString(),
    contactName: contact.name,
    contactPhone: contact.phone,
    conversationStatus: conversation.status,
  };
  const recipients = await whatsappRecipients();
  await broadcastToRelay({ channelId: dto.channelId, recipients, message: dto });
}

/**
 * Silêncio prolongado: se esta foi a N-ésima proativa seguida sem NENHUMA
 * resposta do cliente, avisa a equipe (uma vez, ao cruzar o limiar) para
 * tentar contato por outro canal. Não bloqueia envios futuros. Best-effort:
 * falha aqui nunca derruba o envio que já aconteceu.
 */
async function alertIfUnanswered(
  contact: { id: string; phone: string; name: string | null },
  authorId: string,
  authorName: string,
): Promise<void> {
  try {
    const lastInbound = await db.whatsAppMessage.findFirst({
      where: { contactId: contact.id, direction: "in" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const unanswered = await db.whatsAppMessage.count({
      where: {
        contactId: contact.id,
        direction: "out",
        systemSource: { not: null },
        ...(lastInbound ? { createdAt: { gt: lastInbound.createdAt } } : {}),
      },
    });
    // Só no cruzamento exato do limiar — dispara uma única vez por "seca".
    if (unanswered !== UNANSWERED_ALERT_THRESHOLD) return;

    const label = contact.name ?? `+${contact.phone}`;
    const recipients = await whatsappRecipients();
    for (const recipientId of recipients) {
      await db.notification.create({
        data: {
          recipientId,
          authorId: "whatsapp-bot",
          authorName: "🤖 Bot WhatsApp",
          targetName: label,
          message: `WhatsApp: ${label} já recebeu ${unanswered} avisos automáticos sem responder nenhum — considere contato por telefone/outro canal.`,
          contactId: contact.id,
        },
      });
    }
    await logWhatsAppEvent({
      action: "wa_text",
      message: `alerta de silêncio: ${label} recebeu ${unanswered} mensagens automáticas sem responder`,
      authorId,
      authorName,
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      metadata: { automated: true, unansweredCount: unanswered },
    });
  } catch (err) {
    console.error("[WHATSAPP OUTBOUND] Falha no alerta de silêncio:", contact.id, err);
  }
}

export interface SystemSendInput {
  phone: string; // telefone do card (qualquer máscara)
  clientName?: string | null;
  /** Texto livre — usado quando a janela de 24h está aberta. */
  text: string;
  /**
   * Fallback fora da janela: nome de um template APROVADO na Meta (cadastro
   * local em whatsapp_templates) + variáveis já resolvidas. Sem isso, fora
   * da janela o envio é pulado.
   */
  templateName?: string | null;
  templateVars?: string[];
  /** Identificação de quem disparou (para auditoria nos logs). */
  authorId: string;
  authorName: string;
  /** Origem: "automation" | "progress" — vai pro metadata do log. */
  source: string;
}

export interface SystemSendResult {
  sent: boolean;
  via: "text" | "template" | null;
  reason?: string;
}

/**
 * Envia uma mensagem de sistema ao cliente respeitando a janela de 24h.
 * Nunca lança: qualquer falha vira { sent: false, reason } + log de auditoria.
 */
export async function sendSystemWhatsApp(input: SystemSendInput): Promise<SystemSendResult> {
  try {
    const contact = await findOrCreateContactByPhone(input.phone, input.clientName);
    if (!contact) return { sent: false, via: null, reason: "telefone do card inválido" };
    if (contact.optedOut) return { sent: false, via: null, reason: "contato pediu para não receber mensagens" };

    // Cap de frequência: já houve proativa há menos de SYSTEM_COOLDOWN_MS?
    // Pula (o card avançando várias etapas de uma vez não vira rajada).
    const lastProactive = await db.whatsAppMessage.findFirst({
      where: {
        contactId: contact.id,
        direction: "out",
        systemSource: { not: null },
        createdAt: { gte: new Date(Date.now() - SYSTEM_COOLDOWN_MS) },
      },
      select: { id: true },
    });
    if (lastProactive) {
      await logWhatsAppEvent({
        action: "wa_text",
        message: `não enviou mensagem automática para ${contact.name ?? contact.phone}: intervalo mínimo entre mensagens automáticas ainda não passou`,
        authorId: input.authorId,
        authorName: input.authorName,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        metadata: { source: input.source, automated: true, skipped: true, reason: "cooldown" },
      });
      return { sent: false, via: null, reason: "intervalo mínimo entre mensagens automáticas ainda não passou" };
    }

    const windowOpen = await isWindowOpen(contact.id);

    if (windowOpen) {
      const body = input.text + OPT_OUT_FOOTER;
      const result = await sendText(contact.phone, body);
      if (!result.waMessageId) {
        return { sent: false, via: "text", reason: result.error ?? "Meta rejeitou o envio" };
      }
      await persistSystemMessage(contact, result.waMessageId, body, input.source);
      await logWhatsAppEvent({
        action: "wa_text",
        message: `enviou mensagem automática para ${contact.name ?? contact.phone}`,
        authorId: input.authorId,
        authorName: input.authorName,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        metadata: { source: input.source, automated: true, preview: input.text.slice(0, 120) },
      });
      await alertIfUnanswered(contact, input.authorId, input.authorName);
      return { sent: true, via: "text" };
    }

    // Janela expirada → mensagem PROATIVA de verdade. A Meta exige opt-in
    // documentado: sem registro de aceite, o envio é pulado (e logado).
    if (!contact.optedInAt) {
      await logWhatsAppEvent({
        action: "wa_text",
        message: `não enviou mensagem automática para ${contact.name ?? contact.phone}: contato sem opt-in registrado (nunca iniciou conversa nem aceitou receber mensagens)`,
        authorId: input.authorId,
        authorName: input.authorName,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        metadata: { source: input.source, automated: true, skipped: true, reason: "sem opt-in" },
      });
      return { sent: false, via: null, reason: "contato sem opt-in registrado" };
    }

    // Janela expirada → só template aprovado.
    if (!input.templateName) {
      await logWhatsAppEvent({
        action: "wa_text",
        message: `não enviou mensagem automática para ${contact.name ?? contact.phone}: janela de 24h expirada e nenhum template configurado`,
        authorId: input.authorId,
        authorName: input.authorName,
        contactId: contact.id,
        contactName: contact.name,
        contactPhone: contact.phone,
        metadata: { source: input.source, automated: true, skipped: true },
      });
      return { sent: false, via: null, reason: "janela de 24h expirada e nenhum template configurado" };
    }

    const template = await db.whatsAppTemplate.findUnique({ where: { name: input.templateName } });
    if (!template) {
      return { sent: false, via: "template", reason: `template "${input.templateName}" não cadastrado (sincronize com a Meta)` };
    }
    const vars = (input.templateVars ?? []).slice(0, template.bodyVars);
    while (vars.length < template.bodyVars) vars.push("");

    const result = await sendTemplate(contact.phone, template.name, vars, template.language);
    if (!result.waMessageId) {
      return { sent: false, via: "template", reason: result.error ?? "Meta rejeitou o template" };
    }

    const preview = template.bodyPreview
      ? vars.reduce((acc, v, i) => acc.replaceAll(`{{${i + 1}}}`, v), template.bodyPreview)
      : `[Template: ${template.name}]${vars.length ? ` (${vars.join(", ")})` : ""}`;
    await persistSystemMessage(contact, result.waMessageId, preview, input.source);
    await logWhatsAppEvent({
      action: "wa_template",
      message: `enviou o template automático "${template.name}" para ${contact.name ?? contact.phone}`,
      authorId: input.authorId,
      authorName: input.authorName,
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      metadata: { source: input.source, automated: true, templateName: template.name, vars },
    });
    await alertIfUnanswered(contact, input.authorId, input.authorName);
    return { sent: true, via: "template" };
  } catch (err) {
    console.error("[WHATSAPP OUTBOUND] Falha no envio de sistema:", err);
    return { sent: false, via: null, reason: String(err) };
  }
}

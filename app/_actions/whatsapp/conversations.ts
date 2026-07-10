'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';
import { logWhatsAppEvent } from '@/app/_shared/lib/log';
import { CLOSE_CATEGORY_LABELS, QUALIFIED_BY_CATEGORY } from '@/app/_shared/lib/whatsapp/close-categories';

// Fila e atribuição de conversas de WhatsApp (estilo Botconversa):
// bot → queued (handoff) → human (atendente assume) → closed.

const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++'];

/** Busca contactId + nome/telefone para anexar aos logs de auditoria. */
async function convContact(conversationId: string) {
  const conv = await db.whatsAppConversation.findUnique({
    where: { id: conversationId },
    select: { contactId: true, status: true, contact: { select: { name: true, phone: true } } },
  });
  return conv;
}

async function requireTeamMember(): Promise<{ id: string; name: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, role: true },
  });
  if (!user || !TEAM_ROLES.includes(user.role)) {
    throw new Error('Sem permissão para o atendimento de WhatsApp.');
  }
  return { id: user.id, name: user.name ?? 'Atendente' };
}

export interface WhatsAppConversationDTO {
  id: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string;
  status: string; // bot | queued | human | closed
  qualified: boolean | null; // só relevante quando status="closed"
  // Categoria do desfecho (só relevante quando status="closed"): qualificado |
  // nao_qualificado | perguntas | novo_acidente | transferido.
  closeCategory: string | null;
  assignedToId: string | null;
  assignedToName: string | null;
  lastMessageAt: string;
  lastReadAt: string | null;
  lastInboundAt: string | null; // controla a janela de 24h da Meta
  lastMessagePreview: string | null;
  unread: boolean;
  tags: { id: string; name: string; color: string }[];
}

export async function listWhatsAppConversations(): Promise<WhatsAppConversationDTO[]> {
  await requireTeamMember();

  const conversations = await db.whatsAppConversation.findMany({
    orderBy: { lastMessageAt: 'desc' },
    take: 200,
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      tags: { include: { tag: true } },
    },
  });
  if (!conversations.length) return [];

  const contactIds = conversations.map((c) => c.contactId);

  // Última mensagem (preview) e última mensagem RECEBIDA (janela de 24h) por
  // contato — distinct + orderBy desc devolve a primeira linha de cada grupo.
  const [lastMessages, lastInbound, assignees] = await Promise.all([
    db.whatsAppMessage.findMany({
      where: { contactId: { in: contactIds } },
      orderBy: { createdAt: 'desc' },
      distinct: ['contactId'],
      select: { contactId: true, body: true, mediaType: true, direction: true },
    }),
    db.whatsAppMessage.findMany({
      where: { contactId: { in: contactIds }, direction: 'in' },
      orderBy: { createdAt: 'desc' },
      distinct: ['contactId'],
      select: { contactId: true, createdAt: true },
    }),
    db.user.findMany({
      where: { id: { in: conversations.map((c) => c.assignedToId).filter(Boolean) as string[] } },
      select: { id: true, name: true },
    }),
  ]);

  const previewByContact = new Map(lastMessages.map((m) => [m.contactId, m]));
  const inboundByContact = new Map(lastInbound.map((m) => [m.contactId, m.createdAt]));
  const nameById = new Map(assignees.map((u) => [u.id, u.name ?? 'Atendente']));

  return conversations.map((c) => {
    const last = previewByContact.get(c.contactId);
    const preview = last
      ? last.body ?? (last.mediaType ? '📎 Anexo' : null)
      : null;
    const inboundAt = inboundByContact.get(c.contactId) ?? null;
    return {
      id: c.id,
      contactId: c.contactId,
      contactName: c.contact.name,
      contactPhone: c.contact.phone,
      status: c.status,
      qualified: c.qualified,
      closeCategory: c.closeCategory,
      assignedToId: c.assignedToId,
      assignedToName: c.assignedToId ? nameById.get(c.assignedToId) ?? null : null,
      lastMessageAt: c.lastMessageAt.toISOString(),
      lastReadAt: c.lastReadAt?.toISOString() ?? null,
      lastInboundAt: inboundAt?.toISOString() ?? null,
      lastMessagePreview: last?.direction === 'out' && preview ? `Você: ${preview}` : preview,
      unread: !c.lastReadAt || c.lastMessageAt > c.lastReadAt,
      tags: c.tags.map((t) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    };
  });
}

export interface AttendantDTO {
  id: string;
  name: string;
}

/** Atendentes com role ADMIN — popula o filtro de "Com outros atendentes". */
export async function listWhatsAppAttendants(): Promise<AttendantDTO[]> {
  await requireTeamMember();
  const users = await db.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  return users.map((u) => ({ id: u.id, name: u.name ?? 'Atendente' }));
}

/** Atendente assume a conversa (sai da fila / tira do bot / reabre se estava encerrada). */
export async function assumeConversation(conversationId: string): Promise<void> {
  const me = await requireTeamMember();
  const before = await convContact(conversationId);
  await db.whatsAppConversation.update({
    where: { id: conversationId },
    data: { status: 'human', assignedToId: me.id, qualified: null },
  });
  if (before) {
    // "Assumir" reabre quando estava encerrada; senão é uma atribuição normal.
    const reopened = before.status === 'closed';
    await logWhatsAppEvent({
      action: reopened ? 'wa_reopen' : 'wa_assign',
      message: reopened
        ? `reabriu e assumiu o atendimento de ${before.contact?.name ?? before.contact?.phone}`
        : `assumiu o atendimento de ${before.contact?.name ?? before.contact?.phone}`,
      authorId: me.id,
      authorName: me.name,
      contactId: before.contactId,
      contactName: before.contact?.name,
      contactPhone: before.contact?.phone,
    });
  }
}

/** Devolve a conversa pro bot responder. */
export async function returnConversationToBot(conversationId: string): Promise<void> {
  const me = await requireTeamMember();
  const before = await convContact(conversationId);
  await db.whatsAppConversation.update({
    where: { id: conversationId },
    data: { status: 'bot', assignedToId: null },
  });
  if (before) {
    await logWhatsAppEvent({
      action: 'wa_return_bot',
      message: `devolveu ${before.contact?.name ?? before.contact?.phone} para o atendimento automático (bot)`,
      authorId: me.id,
      authorName: me.name,
      contactId: before.contactId,
      contactName: before.contact?.name,
      contactPhone: before.contact?.phone,
    });
  }
}

/**
 * Encerra o atendimento marcando a CATEGORIA do desfecho (qualificado,
 * não qualificado, perguntas, novo acidente, transferido). Se o cliente mandar
 * mensagem depois, a conversa reabre pro bot automaticamente.
 *
 * Aceita também `true/false` (compat) → qualificado / não qualificado.
 */
export async function closeConversation(
  conversationId: string,
  category: string | boolean = 'nao_qualificado',
): Promise<void> {
  const me = await requireTeamMember();
  const before = await convContact(conversationId);

  const cat = typeof category === 'boolean' ? (category ? 'qualificado' : 'nao_qualificado') : category;
  const closeCategory = cat in QUALIFIED_BY_CATEGORY ? cat : 'nao_qualificado';
  const qualified = QUALIFIED_BY_CATEGORY[closeCategory];
  const label = CLOSE_CATEGORY_LABELS[closeCategory] ?? closeCategory;

  await db.whatsAppConversation.update({
    where: { id: conversationId },
    // Ticket encerrado: zera a memória/estado do bot para que uma futura
    // conversa desse cliente comece do zero.
    data: { status: 'closed', assignedToId: null, qualified, closeCategory, botMemory: null, botState: null, botFailCount: 0 },
  });
  if (before) {
    await logWhatsAppEvent({
      action: 'wa_close',
      message: `encerrou o atendimento de ${before.contact?.name ?? before.contact?.phone} como ${label}`,
      authorId: me.id,
      authorName: me.name,
      contactId: before.contactId,
      contactName: before.contact?.name,
      contactPhone: before.contact?.phone,
      metadata: { qualified, closeCategory, by: 'atendente' },
    });
  }
}

/** Zera o badge de não-lida (marcador global da conversa, não por usuário). */
export async function markConversationRead(conversationId: string): Promise<void> {
  await requireTeamMember();
  await db.whatsAppConversation.update({
    where: { id: conversationId },
    data: { lastReadAt: new Date() },
  });
}

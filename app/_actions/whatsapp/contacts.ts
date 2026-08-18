'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';
import { logWhatsAppEvent } from '@/app/_shared/lib/log';
import { requirePermission } from '@/app/_shared/lib/permissions-server';

const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++'];

/**
 * Cria um contato manualmente (fora do fluxo de webhook) e a conversa dele,
 * já em atendimento humano com quem criou. Fora da janela de 24h da Meta o
 * primeiro contato precisa sair por template — o composer já cuida disso.
 */
export async function createWhatsAppContact(phoneRaw: string, name: string): Promise<{ contactId: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !TEAM_ROLES.includes(session.user.role ?? '')) {
    throw new Error('Sem permissão para o atendimento de WhatsApp.');
  }

  // Normaliza pra E.164 BR: só dígitos; sem DDI, assume 55.
  let phone = phoneRaw.replace(/\D/g, '');
  if (!phone) throw new Error('Informe o celular.');
  if (!phone.startsWith('55')) phone = `55${phone}`;
  if (phone.length < 12 || phone.length > 13) throw new Error('Celular inválido — use DDD + número (ex.: 41 99999-9999).');

  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Informe o nome do contato.');

  // Número da empresa: o default (ou o primeiro ativo) atende o contato novo.
  const number = await db.whatsAppNumber.findFirst({
    where: { active: true },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: { id: true },
  });

  const existing = await db.whatsAppContact.findFirst({ where: { phone } });
  if (existing) {
    // Contato já existe: garante a conversa e devolve — a UI só abre o chat.
    await db.whatsAppConversation.upsert({
      where: { contactId: existing.id },
      update: {},
      create: { contactId: existing.id, numberId: existing.numberId, status: 'human', assignedToId: session.user.id, lastMessageAt: new Date() },
    });
    return { contactId: existing.id };
  }

  const contact = await db.whatsAppContact.create({
    data: {
      phone,
      name: trimmedName,
      numberId: number?.id ?? null,
      optedInAt: new Date(),
      optInSource: 'manual',
    },
  });
  await db.whatsAppConversation.create({
    data: { contactId: contact.id, numberId: number?.id ?? null, status: 'human', assignedToId: session.user.id, lastMessageAt: new Date() },
  });
  await logWhatsAppEvent({
    action: 'wa_contact',
    message: `Contato criado manualmente: ${trimmedName} (+${phone})`,
    authorId: session.user.id,
    authorName: session.user.name ?? 'Equipe',
    contactId: contact.id,
    contactName: trimmedName,
    contactPhone: phone,
    metadata: { operation: 'create_manual' },
  });
  return { contactId: contact.id };
}

// ---------------------------------------------------------------------------
// Agenda de contatos (18/08/2026): navega TODOS os contatos da linha — mesmo
// quem nunca trocou mensagem (ex.: os 2.224 importados do BotConversa). A
// pasta "Contatos" do inbox usa isto.

export interface WaDirectoryContact {
  id: string;
  name: string | null;
  phone: string;
  numberId: string | null;
  importSource: string | null;
  /** Status da conversa quando ela existe (abre direto); null = nunca falou. */
  conversationStatus: string | null;
  createdAt: string;
}

export interface WaDirectoryPage {
  total: number;
  items: WaDirectoryContact[];
}

const DIRECTORY_PAGE = 100;

export async function listWaContactsDirectory(
  search: string,
  numberId: string | null,
  offset: number,
): Promise<WaDirectoryPage> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !TEAM_ROLES.includes(session.user.role ?? '')) {
    throw new Error('Sem permissão para o atendimento de WhatsApp.');
  }

  const term = search.trim();
  const digits = term.replace(/\D/g, '');
  const where = {
    ...(numberId ? { numberId } : {}),
    ...(term
      ? {
          OR: [
            { name: { contains: term, mode: 'insensitive' as const } },
            ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    db.whatsAppContact.count({ where }),
    db.whatsAppContact.findMany({
      where,
      orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
      skip: Math.max(0, Math.round(offset) || 0),
      take: DIRECTORY_PAGE,
      select: {
        id: true, name: true, phone: true, numberId: true, importSource: true, createdAt: true,
        conversation: { select: { status: true } },
      },
    }),
  ]);

  return {
    total,
    items: rows.map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      numberId: r.numberId,
      importSource: r.importSource,
      conversationStatus: r.conversation?.status ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/**
 * Garante a conversa de um contato da agenda e devolve o contactId — a UI abre
 * o chat (fora da janela de 24h o composer oferece o template). Conversa nova
 * nasce em atendimento humano com quem clicou, para o bot não atropelar.
 */
export async function openContactConversation(contactId: string): Promise<{ contactId: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || !TEAM_ROLES.includes(session.user.role ?? '')) {
    throw new Error('Sem permissão para o atendimento de WhatsApp.');
  }
  const contact = await db.whatsAppContact.findUnique({ where: { id: contactId }, select: { id: true, numberId: true } });
  if (!contact) throw new Error('Contato não encontrado.');
  await db.whatsAppConversation.upsert({
    where: { contactId: contact.id },
    update: {},
    create: { contactId: contact.id, numberId: contact.numberId, status: 'human', assignedToId: session.user.id, lastMessageAt: new Date() },
  });
  return { contactId: contact.id };
}

// Ações destrutivas sobre CONTATOS do WhatsApp (bloquear/desbloquear/excluir).
// Todas exigem a permissão "manage_wa_contacts" (padrão: só ADMIN++; o Super
// Admin pode conceder ao ADMIN+ por override na tela de Equipe).

/**
 * Bloqueia um contato: marca opt-out (bot e mensagens proativas param na hora)
 * e encerra a conversa como "descartado". O histórico é preservado.
 */
export async function blockWhatsAppContact(contactId: string): Promise<void> {
  const me = await requirePermission('manage_wa_contacts');
  const contact = await db.whatsAppContact.findUnique({
    where: { id: contactId },
    select: { name: true, phone: true, optedOut: true },
  });
  if (!contact) throw new Error('Contato não encontrado.');

  await db.whatsAppContact.update({ where: { id: contactId }, data: { optedOut: true } });
  await db.whatsAppConversation.updateMany({
    where: { contactId, status: { not: 'closed' } },
    data: {
      status: 'closed', assignedToId: null, closeCategory: 'descartado', qualified: null,
      botFailCount: 0, urgent: false, queuedAt: null, queueAlertAt: null,
      recoveryAttempts: 0, recoveryNextAt: null, recoveryOutcome: null,
    },
  });
  await logWhatsAppEvent({
    action: 'wa_contact',
    message: `Contato BLOQUEADO (opt-out manual): ${contact.name ?? contact.phone}`,
    authorId: me.userId,
    authorName: me.name ?? 'Equipe',
    contactId,
    contactName: contact.name,
    contactPhone: contact.phone,
    metadata: { operation: 'block' },
  });
}

/** Desbloqueia um contato bloqueado (volta a poder ser atendido). */
export async function unblockWhatsAppContact(contactId: string): Promise<void> {
  const me = await requirePermission('manage_wa_contacts');
  const contact = await db.whatsAppContact.findUnique({
    where: { id: contactId },
    select: { name: true, phone: true },
  });
  if (!contact) throw new Error('Contato não encontrado.');

  await db.whatsAppContact.update({ where: { id: contactId }, data: { optedOut: false } });
  await logWhatsAppEvent({
    action: 'wa_contact',
    message: `Contato DESBLOQUEADO: ${contact.name ?? contact.phone}`,
    authorId: me.userId,
    authorName: me.name ?? 'Equipe',
    contactId,
    contactName: contact.name,
    contactPhone: contact.phone,
    metadata: { operation: 'unblock' },
  });
}

/**
 * Exclui um contato PERMANENTEMENTE: conversa, mensagens, tags e leituras vão
 * junto (cascade do Prisma). Os anexos continuam no S3 (sem referência).
 * Irreversível — a UI confirma antes.
 */
export async function deleteWhatsAppContact(contactId: string): Promise<void> {
  const me = await requirePermission('manage_wa_contacts');
  const contact = await db.whatsAppContact.findUnique({
    where: { id: contactId },
    select: { name: true, phone: true, _count: { select: { messages: true } } },
  });
  if (!contact) throw new Error('Contato não encontrado.');

  await db.whatsAppContact.delete({ where: { id: contactId } });
  await logWhatsAppEvent({
    action: 'wa_contact',
    message: `Contato EXCLUÍDO com histórico (${contact._count.messages} mensagens): ${contact.name ?? contact.phone}`,
    authorId: me.userId,
    authorName: me.name ?? 'Equipe',
    contactId,
    contactName: contact.name,
    contactPhone: contact.phone,
    metadata: { operation: 'delete', messages: contact._count.messages },
  });
}

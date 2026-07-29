'use server';

import { db } from '@/app/_shared/lib/prisma';
import { logWhatsAppEvent } from '@/app/_shared/lib/log';
import { requirePermission } from '@/app/_shared/lib/permissions-server';

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

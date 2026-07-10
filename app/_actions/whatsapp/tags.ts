'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';

// Tags livres pra organizar conversas de WhatsApp (ex.: "Urgente", "VIP",
// "Recontato"), independente do status (fila/meus/bot/encerradas).

const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++'];

async function requireTeamMember(): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');
  const me = await db.user.findUnique({ where: { id: session.user.id }, select: { role: true } });
  if (!me || !TEAM_ROLES.includes(me.role)) throw new Error('Sem permissão para o atendimento de WhatsApp.');
}

export interface WhatsAppTagDTO {
  id: string;
  name: string;
  color: string;
}

export async function listWhatsAppTags(): Promise<WhatsAppTagDTO[]> {
  await requireTeamMember();
  const tags = await db.whatsAppTag.findMany({ orderBy: { name: 'asc' } });
  return tags.map((t) => ({ id: t.id, name: t.name, color: t.color }));
}

export async function saveWhatsAppTag(input: { id?: string; name: string; color: string }): Promise<WhatsAppTagDTO> {
  await requireTeamMember();
  const name = input.name.trim();
  if (!name) throw new Error('Dê um nome à tag.');
  const color = /^#[0-9a-fA-F]{6}$/.test(input.color) ? input.color : '#10b981';

  const tag = input.id
    ? await db.whatsAppTag.update({ where: { id: input.id }, data: { name, color } })
    : await db.whatsAppTag.create({ data: { name, color } });
  return { id: tag.id, name: tag.name, color: tag.color };
}

export async function deleteWhatsAppTag(id: string): Promise<void> {
  await requireTeamMember();
  await db.whatsAppTag.delete({ where: { id } });
}

/** Liga/desliga uma tag numa conversa. */
export async function toggleConversationTag(conversationId: string, tagId: string): Promise<void> {
  await requireTeamMember();
  const existing = await db.whatsAppConversationTag.findUnique({
    where: { conversationId_tagId: { conversationId, tagId } },
  });
  if (existing) {
    await db.whatsAppConversationTag.delete({ where: { conversationId_tagId: { conversationId, tagId } } });
  } else {
    await db.whatsAppConversationTag.create({ data: { conversationId, tagId } });
  }
}

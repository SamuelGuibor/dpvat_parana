'use server';

import { db } from '@/app/_shared/lib/prisma';
import { authOptions } from '@/app/_shared/lib/auth';
import { getServerSession } from 'next-auth';
import { broadcastToRelay } from '@/app/_shared/lib/chat-relay';
import { canAccessChannel, channelRecipients } from '@/app/_shared/lib/chat-access';

export interface ReactionDTO {
  emoji: string;
  userId: string;
  userName: string;
}

// Conjunto permitido de emojis de reação (evita payload arbitrário no banco).
const ALLOWED = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '✅'];

/**
 * Alterna (toggle) uma reação do usuário logado numa mensagem: se já reagiu com
 * aquele emoji, remove; senão, adiciona. Reemite a lista de reações da mensagem
 * em tempo real para todos os participantes do canal.
 */
export async function toggleReaction({ messageId, emoji }: { messageId: string; emoji: string }): Promise<ReactionDTO[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');
  if (!ALLOWED.includes(emoji)) throw new Error('Emoji não permitido.');

  const msg = await db.chatMessage.findUnique({
    where: { id: messageId },
    select: { id: true, channelId: true, deletedAt: true },
  });
  if (!msg || msg.deletedAt) throw new Error('Mensagem indisponível.');
  if (!(await canAccessChannel(msg.channelId, session.user.id))) {
    throw new Error('Sem acesso a este canal.');
  }

  const existing = await db.chatReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId: session.user.id, emoji } },
    select: { id: true },
  });

  if (existing) {
    await db.chatReaction.delete({ where: { id: existing.id } });
  } else {
    await db.chatReaction.create({
      data: { messageId, userId: session.user.id, userName: session.user.name ?? 'Usuário', emoji },
    });
  }

  const reactions = await db.chatReaction.findMany({
    where: { messageId },
    orderBy: { createdAt: 'asc' },
    select: { emoji: true, userId: true, userName: true },
  });

  // Reusa o pipeline SSE: manda um "patch" de reações. O client aplica sem
  // precisar recarregar a mensagem inteira.
  const recipients = await channelRecipients(msg.channelId, session.user.id);
  await broadcastToRelay({
    channelId: msg.channelId,
    recipients,
    message: { type: 'reaction', messageId, channelId: msg.channelId, reactions } as unknown as Record<string, unknown>,
  });

  return reactions;
}

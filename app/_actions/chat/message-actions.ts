'use server';

import { db } from '@/app/_shared/lib/prisma';
import { authOptions } from '@/app/_shared/lib/auth';
import { getServerSession } from 'next-auth';
import { broadcastToRelay } from '@/app/_shared/lib/chat-relay';
import { channelRecipients } from '@/app/_shared/lib/chat-access';
import type { ChatMessageDTO } from './send-message';

function toDTO(m: {
  id: string; body: string; authorId: string; authorName: string; channelId: string;
  createdAt: Date; editedAt: Date | null; deletedAt: Date | null;
  replyToId: string | null; replyToAuthor: string | null; replyToBody: string | null;
}): ChatMessageDTO {
  return {
    id: m.id,
    body: m.body,
    authorId: m.authorId,
    authorName: m.authorName,
    channelId: m.channelId,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt?.toISOString() ?? null,
    deletedAt: m.deletedAt?.toISOString() ?? null,
    replyToId: m.replyToId,
    replyToAuthor: m.replyToAuthor,
    replyToBody: m.replyToBody,
  };
}

async function loadOwnedMessage(messageId: string, userId: string) {
  const msg = await db.chatMessage.findUnique({ where: { id: messageId } });
  if (!msg) throw new Error('Mensagem não encontrada.');
  if (msg.authorId !== userId) throw new Error('Você só pode alterar suas próprias mensagens.');
  return msg;
}

/** Edita o corpo da própria mensagem (marca editedAt) e reemite em tempo real. */
export async function editMessage({ messageId, body }: { messageId: string; body: string }): Promise<ChatMessageDTO> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');

  const text = body.trim();
  if (!text) throw new Error('Mensagem vazia.');
  if (text.length > 4000) throw new Error('Mensagem muito longa.');

  const existing = await loadOwnedMessage(messageId, session.user.id);
  if (existing.deletedAt) throw new Error('Mensagem apagada não pode ser editada.');

  const updated = await db.chatMessage.update({
    where: { id: messageId },
    data: { body: text, editedAt: new Date() },
  });

  const dto = toDTO(updated);
  const recipients = await channelRecipients(updated.channelId, session.user.id);
  await broadcastToRelay({ channelId: updated.channelId, recipients, message: dto });
  return dto;
}

/** Apaga (soft-delete) a própria mensagem — vira "mensagem apagada". */
export async function deleteMessage({ messageId }: { messageId: string }): Promise<ChatMessageDTO> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');

  const existing = await loadOwnedMessage(messageId, session.user.id);

  const updated = await db.chatMessage.update({
    where: { id: messageId },
    // Zera o corpo para não deixar rastro do conteúdo apagado.
    data: { body: '', deletedAt: new Date(), editedAt: null },
  });

  const dto = toDTO(updated);
  const recipients = await channelRecipients(updated.channelId, session.user.id);
  await broadcastToRelay({ channelId: updated.channelId, recipients, message: dto });
  return dto;
}

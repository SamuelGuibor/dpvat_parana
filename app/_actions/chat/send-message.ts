'use server';

import { db } from '@/app/_shared/lib/prisma';
import { authOptions } from '@/app/_shared/lib/auth';
import { getServerSession } from 'next-auth';
import { extractMentions } from '@/app/_shared/utils/mentions';
import { broadcastToRelay } from '@/app/_shared/lib/chat-relay';
import { canAccessChannel, channelRecipients } from '@/app/_shared/lib/chat-access';

interface SendMessageInput {
  channelId: string;
  body: string;
  replyToId?: string | null;
}

export interface ChatMessageDTO {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  channelId: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
  replyToId: string | null;
  replyToAuthor: string | null;
  replyToBody: string | null;
}

/**
 * Envia uma mensagem no chat da equipe.
 *
 * Segurança: valida sessão e acesso ao canal (general público; DM só entre os
 * dois; canal custom só membros). Cria Notification por @menção (padrão de
 * comment-actions.ts) e avisa o relay SSE para entrega em tempo real.
 */
export async function sendMessage({ channelId, body, replyToId }: SendMessageInput): Promise<ChatMessageDTO> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');

  const text = body.trim();
  if (!text) throw new Error('Mensagem vazia.');
  if (text.length > 4000) throw new Error('Mensagem muito longa.');

  if (!(await canAccessChannel(channelId, session.user.id))) {
    throw new Error('Sem acesso a este canal.');
  }

  const authorName = session.user.name ?? 'Usuário';

  // Snapshot da mensagem respondida (para render estável mesmo se o pai mudar).
  let replyToAuthor: string | null = null;
  let replyToBody: string | null = null;
  let validReplyId: string | null = null;
  if (replyToId) {
    const parent = await db.chatMessage.findUnique({
      where: { id: replyToId },
      select: { id: true, channelId: true, authorName: true, body: true },
    });
    if (parent && parent.channelId === channelId) {
      validReplyId = parent.id;
      replyToAuthor = parent.authorName;
      replyToBody = parent.body.slice(0, 200);
    }
  }

  const message = await db.chatMessage.create({
    data: {
      body: text,
      authorId: session.user.id,
      authorName,
      channelId,
      replyToId: validReplyId,
      replyToAuthor,
      replyToBody,
    },
  });

  const dto: ChatMessageDTO = {
    id: message.id,
    body: message.body,
    authorId: message.authorId,
    authorName: message.authorName,
    channelId: message.channelId,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    replyToId: message.replyToId,
    replyToAuthor: message.replyToAuthor,
    replyToBody: message.replyToBody,
  };

  const recipients = await channelRecipients(channelId, session.user.id);

  // Notificações de @menção (não podem quebrar o envio). "@everyone" expande
  // para todos os destinatários do canal (equivalente a mencionar um por um).
  try {
    const mentions = extractMentions(text);
    const targetIds = new Set<string>();
    for (const mention of mentions) {
      if (mention.id === 'everyone') {
        recipients.forEach((id) => targetIds.add(id));
      } else {
        targetIds.add(mention.id);
      }
    }
    for (const id of targetIds) {
      if (id === session.user.id) continue;
      await db.notification.create({
        data: {
          recipientId: id,
          authorId: session.user.id,
          authorName,
          targetName: 'Chat da equipe',
          message: `Você foi mencionado por ${authorName} no chat`,
        },
      });
    }
  } catch (err) {
    console.error('[CHAT] Falha ao criar notificações de menção:', err);
  }

  await broadcastToRelay({ channelId, recipients, message: dto });

  return dto;
}

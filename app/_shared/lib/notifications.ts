// Aviso pessoal para um membro da equipe: sino (Notification) + Caixa de
// Menções e Tarefas. Sem a menção o aviso some quando a pessoa limpa o sino.
// Recusa destinatário que não é equipe: o card do cliente também é User.

import { db } from "./prisma";
import { recordMentions } from "./mention-inbox";
import { isTeamRole } from "./permissions";
import { isSystemAuthorId } from "./log";
import { CardWriteError, type WriteAuthor } from "./cards/types";

export interface NotifyUserInput {
  recipientId: string;
  author: WriteAuthor;
  message: string;
  card?: { id: string; isProcess: boolean; name: string } | null;
  /** Origem gravada na Caixa de Menções ("op" = IA de operação). */
  source: "op";
}

export async function notifyUser({ recipientId, author, message, card = null, source }: NotifyUserInput): Promise<void> {
  const recipient = await db.user.findUnique({ where: { id: recipientId }, select: { id: true, role: true } });
  if (!recipient || !isTeamRole(recipient.role)) {
    throw new CardWriteError("destinatario_invalido", "O destinatário não é membro da equipe.");
  }
  const targetName = card?.name ?? "IA de operação";
  const cardIds = card ? { userId: card.isProcess ? null : card.id, processId: card.isProcess ? card.id : null } : {};

  await db.notification.create({
    data: {
      recipientId,
      authorId: author.id,
      authorName: author.name,
      targetName,
      message: `${author.name}: ${message}`.slice(0, 500),
      ...cardIds,
    },
  });
  await recordMentions({
    recipientIds: [recipientId],
    authorId: isSystemAuthorId(author.id) ? null : author.id,
    authorName: author.name,
    source,
    text: message,
    targetName,
    ...cardIds,
  });
}

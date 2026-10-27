// Excluir um card (User) de vez. Hoje só a IA de operação chama, depois do
// "aprovo <código>" (L4): o site continua no deleteCard antigo. A exclusão
// leva junto, em cascata, documentos, comentários e o histórico ligado ao
// card — por isso o log daqui nasce SEM userId (sobrevive à cascata) e
// guarda nº, nome e coluna para a auditoria.

import { db } from "../prisma";
import { createLog } from "../log";
import { CardWriteError, sourceMeta, type WriteCommon } from "./types";

export async function deleteCardById(input: WriteCommon): Promise<{ cardNumber: number | null; nome: string | null }> {
  const { cardId, isProcess, author, source, op } = input;
  if (isProcess) throw new CardWriteError("card_nao_encontrado", "Exclusão de Process não é feita por aqui.");
  const card = await db.user.findUnique({
    where: { id: cardId },
    select: { cardNumber: true, name: true, role: true, archiveStatus: true, label: { select: { name: true } } },
  });
  if (!card) throw new CardWriteError("card_nao_encontrado", "Card não encontrado.");

  // Logs `move` nunca são purgados (regra do repo), mas a cascata do User os
  // leva: o resumo (de/para/quando/quem) vai para o log card_delete.
  const moves = await db.log.findMany({
    where: { userId: cardId, action: "move" },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: { message: true, authorName: true, createdAt: true, metadata: true },
  });

  await db.user.delete({ where: { id: cardId } });
  await createLog({
    action: "card_delete",
    message: `excluiu o card nº ${card.cardNumber ?? "?"} (${card.name ?? "sem nome"})`,
    authorId: author.id,
    authorName: author.name,
    metadata: {
      deletedCardId: cardId,
      cardNumber: card.cardNumber,
      cardName: card.name,
      coluna: card.label?.name ?? card.role,
      archiveStatus: card.archiveStatus,
      movimentos: moves.map((m) => ({ em: m.createdAt.toISOString(), por: m.authorName, msg: m.message.slice(0, 200), meta: m.metadata })),
      ...sourceMeta(source, op),
    },
  });
  return { cardNumber: card.cardNumber, nome: card.name };
}

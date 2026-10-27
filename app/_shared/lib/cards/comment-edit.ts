// Editar/apagar comentário que a IA fez (ajuste A, 26/10). Só o comentário
// do PRÓPRIO operador feito "(via IA)": o resto da equipe continua pelo site,
// onde cada um só mexe no seu. O texto antigo vai para o log (o site não
// guarda nada): apagar pela IA fica recuperável pelo histórico do card.

import { db } from "../prisma";
import { createLog } from "../log";
import { sanitizeOpCommentText } from "./comment";
import { CardWriteError, cardRef, sourceMeta, type WriteCommon } from "./types";

export const VIA_IA_SUFFIX = " (via IA)";

export interface CommentEditInput extends WriteCommon {
  commentId: string;
  /** null = apagar. */
  text: string | null;
}

export async function editOpComment(input: CommentEditInput): Promise<{ noop: boolean }> {
  const { cardId, isProcess, commentId, author, source, op } = input;
  const c = await db.comment.findFirst({
    where: { id: commentId, ...(isProcess ? { processId: cardId } : { userId: cardId }) },
    select: { id: true, text: true, authorId: true, authorName: true },
  });
  if (!c) throw new CardWriteError("card_nao_encontrado", "Comentário não encontrado neste card.");
  if (c.authorId !== author.id || !c.authorName.endsWith(VIA_IA_SUFFIX)) {
    throw new CardWriteError("destinatario_invalido", "Só dá para mexer em comentário que você mesmo fez pela IA.");
  }
  const base = { action: "update" as const, authorId: author.id, authorName: author.name, ...cardRef(isProcess, cardId) };
  if (input.text === null) {
    await db.comment.delete({ where: { id: c.id } });
    await createLog({ ...base, message: "apagou um comentário feito pela IA", metadata: { stage: "comment_delete", commentId: c.id, from: c.text.slice(0, 4000), ...sourceMeta(source, op) } });
    return { noop: false };
  }
  const text = sanitizeOpCommentText(input.text);
  if (!text) throw new CardWriteError("texto_vazio", "Comentário vazio.");
  if (text === c.text) return { noop: true };
  await db.comment.update({ where: { id: c.id }, data: { text } });
  await createLog({
    ...base,
    message: "editou um comentário feito pela IA",
    metadata: { stage: "comment_edit", commentId: c.id, from: c.text.slice(0, 4000), to: text.slice(0, 4000), ...sourceMeta(source, op) },
  });
  return { noop: false };
}

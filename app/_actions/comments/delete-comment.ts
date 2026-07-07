'use server';

import { db } from "../../_shared/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../_shared/lib/auth";

export async function deleteComment(commentId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Não autenticado");

  const comment = await db.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new Error("Comentário não encontrado");

  if (comment.authorId !== session.user.id) {
    throw new Error("Sem permissão para excluir este comentário");
  }

  await db.comment.delete({ where: { id: commentId } });
  return { ok: true };
}

'use server';

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";

export async function updateComment({ commentId, text }: { commentId: string; text: string }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Não autenticado");

  const comment = await db.comment.findUnique({ where: { id: commentId } });
  if (!comment) throw new Error("Comentário não encontrado");

  if (comment.authorId !== session.user.id) {
    throw new Error("Sem permissão para editar este comentário");
  }

  return db.comment.update({
    where: { id: commentId },
    data: { text: text.trim() },
  });
}

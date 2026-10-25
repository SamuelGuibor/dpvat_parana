'use server';

import { requireTeamWrite } from "@/app/_shared/lib/permissions-server";
import { addCardComment } from "@/app/_shared/lib/cards/comment";

interface CreateCommentProps {
  text: string;
  userId?: string;
  processId?: string;
}

export async function createComment({
  text,
  userId,
  processId,
}: CreateCommentProps) {
  const ctx = await requireTeamWrite();

  if (!userId && !processId) {
    throw new Error("Comentário precisa estar ligado a um User ou Process");
  }

  // Comment + log comment_add + sino + Caixa de Menções (só equipe é mencionável):
  // app/_shared/lib/cards/comment.ts.
  return addCardComment({
    cardId: (processId ?? userId)!,
    isProcess: !!processId,
    text,
    author: { id: ctx.userId, name: ctx.name ?? "Usuário" },
  });
}

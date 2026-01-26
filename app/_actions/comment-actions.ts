'use server';

import { db } from "../_lib/prisma";
import { authOptions } from "../_lib/auth";
import { getServerSession } from "next-auth";
import { extractMentions } from "@/app/_utils/mentions";

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
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Usuário não autenticado.");
  }

  if (!userId && !processId) {
    throw new Error("Comentário precisa estar ligado a um User ou Process");
  }

  // 🔥 1️⃣ Descobre o nome do card
  let targetName = "";

  if (userId) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    if (!user) throw new Error("Usuário não encontrado");
    targetName = user.name ?? "Usuário";
  }

  if (processId) {
    const process = await db.process.findUnique({
      where: { id: processId },
      select: { name: true },
    });

    if (!process) throw new Error("Processo não encontrado");
    targetName = process.name ?? "Usuário sem nome";
  }

  // 🔥 2️⃣ Salva o comentário com o nome do card
  const comment = await db.comment.create({
    data: {
      text,
      authorId: session.user.id,
      authorName: session.user.name ?? "Usuário",
      userId: userId ?? null,
      processId: processId ?? null,
      targetName,
    },
  });

  // 🔥 3️⃣ Extrai menções
  const mentions = extractMentions(text);

  for (const mention of mentions) {
    if (mention.id === session.user.id) continue;

    await db.notification.create({
      data: {
        recipientId: mention.id,
        authorId: session.user.id,
        authorName: session.user.name ?? "Usuário",
        commentId: comment.id,
        userId: userId ?? null,
        processId: processId ?? null,
        targetName,
        message: `Você foi mencionado por ${session.user.name} em ${targetName}`,
      },
    });
  }

  return comment;
}

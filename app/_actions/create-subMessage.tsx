/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";

interface SubMessageData {
  conteudo: string;
  messageId: string;
}

export async function CreateSubMessage(
  data: SubMessageData
): Promise<SubMessageData & { id: string }> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado.");
  }

  if (!data.conteudo || !data.messageId) {
    throw new Error("Conteúdo e ID da mensagem são obrigatórios.");
  }

  const messageExists = await db.message.findUnique({
    where: { id: data.messageId },
  });

  if (!messageExists) {
    throw new Error("Mensagem não encontrada.");
  }

  const createdSubMessage = await db.subMessage.create({
    data: {
      conteudo: data.conteudo,
      messageId: data.messageId,
    },
    select: {
      id: true,
      conteudo: true,
      messageId: true,
    },
  });

  return createdSubMessage;
}
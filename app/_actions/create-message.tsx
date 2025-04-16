/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";

interface MessagesCardData {
  id?: string;
  titulo?: string;
  role?: string;
  SubMessage?: {
    id?: string;
    conteudo: string;
    messageId?: string;
  }[];
}

export async function CreateMessages(
  data: MessagesCardData
): Promise<MessagesCardData> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado.");
  }

  if (!data.titulo ) {
    throw new Error("Título é obrigatório.");
  }

  const createdMessage = await db.message.create({
    data: {
      titulo: data.titulo,
      role: data.role,
      multipleMessages: {
        create: data.SubMessage?.map((sub) => ({
          conteudo: sub.conteudo,
        })),
      },
    },
    select: {
      id: true,
      titulo: true,
      role: true,
      multipleMessages: {
        select: {
          id: true,
          conteudo: true,
          messageId: true,
        },
      },
    },
  });

  return {
    ...createdMessage,
    SubMessage: createdMessage.multipleMessages,
  };
}
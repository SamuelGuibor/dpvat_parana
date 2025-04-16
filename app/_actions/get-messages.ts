/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";

interface MessagesCardData {
  id: string;
  titulo: string;
  role?: string;
  SubMessage?: {
    id: string;
    conteudo: string;
    messageId: string;
  }[];
}

export async function GetMessages(): Promise<MessagesCardData[]> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado.");
  }

  const messages = await db.message.findMany({
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

  return messages.map((msg) => ({
    ...msg,
    SubMessage: msg.multipleMessages,
  }));
}
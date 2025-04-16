/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";

interface DeleteMessageInput {
  messageId?: string; // Required for deleting a full message or a sub-message
  subMessageId?: string; // Required for deleting a specific sub-message
}

export async function DeleteMessage(data: DeleteMessageInput): Promise<void> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado.");
  }

  if (!data.messageId) {
    throw new Error("ID da mensagem é obrigatório.");
  }

  if (data.subMessageId) {
    // Delete a specific sub-message
    const subMessage = await db.subMessage.findUnique({
      where: { id: data.subMessageId, messageId: data.messageId },
    });

    if (!subMessage) {
      throw new Error("Sub-mensagem não encontrada.");
    }

    await db.subMessage.delete({
      where: { id: data.subMessageId },
    });
  } else {
    // Delete the entire message and its sub-messages
    const message = await db.message.findUnique({
      where: { id: data.messageId },
    });

    if (!message) {
      throw new Error("Mensagem não encontrada.");
    }

    await db.message.delete({
      where: { id: data.messageId },
    });
    // Note: Prisma automatically deletes related multipleMessages due to the relation
  }
}
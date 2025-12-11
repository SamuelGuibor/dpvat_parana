/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { db } from "../_lib/prisma";

export async function DeleteContact(id: string) {
  try {
    await db.contact.delete({
      where: { id },
    });

    return { success: true, message: "Contato deletado com sucesso." };
  } catch (error) {
    return { success: false, message: "Erro ao deletar contato." };
  }
}

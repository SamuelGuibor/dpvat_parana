"use server";

import { db } from "@/app/_shared/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/_shared/lib/auth";

export async function deleteAdmin(id: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado");
  }

  // 🔍 Verifica se o usuário existe
  const user = await db.user.findUnique({
    where: { id },
  });

  if (!user) {
    throw new Error("Administrador não encontrado");
  }

  // 🔥 (Opcional nível senior) evitar deletar a si mesmo
  if (user.email === session.user.email) {
    throw new Error("Você não pode se remover");
  }

  // 🗑️ Deleta
  await db.user.delete({
    where: { id },
  });

  return { success: true };
}
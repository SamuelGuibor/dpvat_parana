"use server";

import { db } from "@/app/_shared/lib/prisma";
import { requirePermission } from "@/app/_shared/lib/permissions-server";

export async function deleteAdmin(id: string) {
  // Remover membro da equipe é gestão de equipe — só ADMIN++.
  const ctx = await requirePermission("manage_team");

  // 🔍 Verifica se o usuário existe
  const user = await db.user.findUnique({
    where: { id },
  });

  if (!user) {
    throw new Error("Administrador não encontrado");
  }

  // 🔥 evitar deletar a si mesmo
  if (user.email === ctx.email) {
    throw new Error("Você não pode se remover");
  }

  if (user.role === "ADMIN++") {
    const superAdmins = await db.user.count({ where: { role: "ADMIN++" } });
    if (superAdmins <= 1) {
      throw new Error("Este é o último Super Admin — promova outro ADMIN++ antes de removê-lo.");
    }
  }

  // 🗑️ Deleta
  await db.user.delete({
    where: { id },
  });

  return { success: true };
}
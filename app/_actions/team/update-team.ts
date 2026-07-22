"use server";

import { db } from "@/app/_shared/lib/prisma";
import { requirePermission } from "@/app/_shared/lib/permissions-server";
import { isTeamRole } from "@/app/_shared/lib/permissions";

interface UpdateUserData {
  id: string;
  role?: string;
}

export async function UpdateRole(data: UpdateUserData) {
  // 🚨 REGRA DE OURO: só o Super Admin (ADMIN++) altera cargos.
  await requirePermission("manage_team");

  if (!data.role || !isTeamRole(data.role)) {
    throw new Error("Cargo inválido. Use ADMIN, ADMIN+ ou ADMIN++.");
  }

  const targetUser = await db.user.findUnique({
    where: { id: data.id },
    select: { id: true, role: true },
  });

  if (!targetUser) {
    throw new Error("Usuário alvo não encontrado.");
  }

  // Nunca deixar o sistema sem nenhum ADMIN++ (ninguém mais conseguiria
  // gerenciar cargos/permissões).
  if (targetUser.role === "ADMIN++" && data.role !== "ADMIN++") {
    const superAdmins = await db.user.count({ where: { role: "ADMIN++" } });
    if (superAdmins <= 1) {
      throw new Error("Este é o último Super Admin — promova outro ADMIN++ antes de rebaixá-lo.");
    }
  }

  const updatedUser = await db.user.update({
    where: { id: data.id },
    data: { role: data.role },
  });

  return {
    id: updatedUser.id,
    role: updatedUser.role,
  };
}

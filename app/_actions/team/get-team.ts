"use server";

import { db } from "@/app/_shared/lib/prisma";
import { requireTeam } from "@/app/_shared/lib/permissions-server";

export async function getAdmins() {
  // Lista CPF/e-mail/permissões de toda a equipe — restrito a membros da
  // equipe (antes qualquer sessão autenticada, inclusive cliente, acessava).
  await requireTeam();

  const admins = await db.user.findMany({
    where: {
      role: { in: ["ADMIN", "ADMIN+", "ADMIN++"] },
    },
    select: {
      id: true,
      name: true,
      cpf: true,
      email: true,
      role: true,
      fixed: true,
      roleFixed: true,
      createdAt: true,
      permissions: true,
    },
  });

  return admins.map((user) => ({
    id: user.id,
    name: user.name || "Sem nome",
    cpf: user.cpf || "",
    email: user.email || "",
    role: user.role,
    fixed: user.fixed ?? false,
    roleFixed: user.roleFixed || "",
    createdAt: user.createdAt,
    permissions: user.permissions ?? null,
  }));
}

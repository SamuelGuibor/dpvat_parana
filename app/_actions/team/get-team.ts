"use server";

import { db } from "@/app/_shared/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/_shared/lib/auth";

export async function getAdmins() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado");
  }

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

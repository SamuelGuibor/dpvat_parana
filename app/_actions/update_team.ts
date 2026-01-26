"use server";

import { db } from "@/app/_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/_lib/auth";

interface UpdateUserData {
  id: string;
  role?: string;
}

export async function UpdateRole(data: UpdateUserData) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado.");
  }

  // 🔐 Usuário que está tentando alterar
  const sessionUser = await db.user.findUnique({
    where: { email: session.user.email },
    select: { role: true },
  });

  if (!sessionUser) {
    throw new Error("Usuário da sessão não encontrado.");
  }

  // 🚨 REGRA DE OURO
  if (sessionUser.role !== "ADMIN++") {
    throw new Error("Você não tem permissão para alterar cargos.");
  }

  // 🔎 Usuário que será alterado
  const targetUser = await db.user.findUnique({
    where: { id: data.id },
    select: { role: true },
  });

  if (!targetUser) {
    throw new Error("Usuário alvo não encontrado.");
  }

  const updatedUser = await db.user.update({
    where: { id: data.id },
    data: {
      role: data.role,
    },
  });

  return {
    id: updatedUser.id,
    role: updatedUser.role,
  };
}

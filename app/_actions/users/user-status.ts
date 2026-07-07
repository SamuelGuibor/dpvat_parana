"use server";

import { db } from "../../_shared/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../_shared/lib/auth";

export async function getUserStatus() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado.");
  }

  const user = await db.user.findUnique({
    where: {
      email: session.user.email,
    },
    select: {
      status: true,
      role: true,
      service: true,
    },
  });

  if (!user) {
    throw new Error("Usuário não encontrado.");
  }

  return { status: user.status, role: user.role, service: user.service };
}

export async function updateUserStatus(newStatus: string) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado.");
  }

  const user = await db.user.update({
    where: {
      email: session.user.email,
    },
    data: {
      status: newStatus,
    },
  });

  return user.status;
} 
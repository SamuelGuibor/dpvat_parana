// app/_actions/statusTimer.ts
"use server";

import { db } from "../_lib/prisma";

export async function updateProcessRole({ userId, newRole }: { userId: string; newRole: string }) {
  try {
    const updatedUser = await db.process.update({
      where: { id: userId },
      data: {
        role: newRole,
        statusStartedAt: new Date(),
      },
    });

    return {
      id: updatedUser.id,
      role: updatedUser.role || "USER",
      statusStartedAt: updatedUser.statusStartedAt,
    };
  } catch (error) {
    console.error("Erro ao atualizar role:", error);
    throw new Error("Não foi possível atualizar o role do usuário.");
  }
}
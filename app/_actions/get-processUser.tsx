"use server";

import { db } from "@/app/_lib/prisma";

export async function getProcessesByUser() {
  try {
    const processes = await db.process.findMany({
      include: {
        user: {
          select: { id: true, name: true, role: true },
        },
      },
    });
    return processes;
  } catch (error) {
    console.error("Erro ao buscar processos:", error);
    throw new Error("Erro ao buscar processos");
  }
}
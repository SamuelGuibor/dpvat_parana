// app/_actions/get-process.ts
"use server";

import { db } from "@/app/_lib/prisma";

export async function getProcess(processId: string) {
  try {
    if (!processId) {
      throw new Error("ID do processo não fornecido");
    }
    const process = await db.process.findUnique({
      where: { id: processId },
      include: { user: { select: { name: true, role: true } } },
    });
    if (!process) {
      throw new Error("Processo não encontrado");
    }
    return process;
  } catch (error) {
    console.error("Erro ao buscar processo:", error);
    throw new Error("Erro ao buscar processo");
  }
}
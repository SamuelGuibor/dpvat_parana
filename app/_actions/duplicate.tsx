"use server";

import { db } from "@/app/_lib/prisma";

interface DuplicateProcessData {
  userId: string;
  type: string; // Tipo do processo (ex.: "DPVAT", "INSS", "SEGURO_VIDA")
}

export async function duplicateProcess({ userId, type }: DuplicateProcessData) {
  try {
    // Validar entrada
    if (!userId || !type) {
      throw new Error("userId e type são obrigatórios");
    }

    // Buscar o último processo do usuário
    const lastProcess = await db.process.findFirst({
      where: { userId: userId }, // Explicitamente especificar userId
      orderBy: { createdAt: "desc" },
    });

    // Criar um novo processo
    const newProcess = await db.process.create({
      data: {
        userId,
        type,
        status: "INICIADO",
        statusStartedAt: new Date(),
        role: lastProcess?.role || "", // Etapa administrativa inicial
        data_acidente: lastProcess?.data_acidente || null,
        atendimento_via: lastProcess?.atendimento_via || null,
        hospital: lastProcess?.hospital || null,
        outro_hospital: lastProcess?.outro_hospital || null,
        lesoes: lastProcess?.lesoes || null,
        observacao: lastProcess?.observacao || "",
      },
      include: {
        user: { select: { name: true, role: true } },
      },
    });

    return {
      success: true,
      process: newProcess,
    };
  } catch (error) {
    console.error("Erro ao duplicar processo:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Erro ao duplicar processo",
    };
  }
}
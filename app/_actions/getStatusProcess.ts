// app/_actions/get-process.ts
'use server';

import { db } from "@/app/_lib/prisma";

interface userProcess {
  id: string;
  name: string | null; // Allow null for name
  type: string | null; // Allow null for type
  service: string | null
}

export async function getStatusProcess(type: string, userId: string, service: string): Promise<userProcess[]> {
  try {
    const processes = await db.process.findMany({
      where: {
        userId: userId,
        type: type,
        service: service
      },
      select: {
        id: true,
        name: true,
        type: true,
        service: true
      },
    });

    return processes;
  } catch (error) {
    console.error("Erro ao buscar processos:", error);
    return [];
  }
}
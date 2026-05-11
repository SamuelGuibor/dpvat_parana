// app/_actions/getStatusUser.ts
'use server';

import { db } from "@/app/_lib/prisma";

interface userStatus {
  id: string;
  name: string | null;
  service: string | null;
}

export async function getStatus(id: string): Promise<userStatus[]> {
  try {
    const userStatus = await db.user.findMany({
      where: {
        id: id,
      },
      select: {
        id: true,
        name: true,
        service: true,
      },
    });

    return userStatus;
  } catch (error) {
    console.error("Erro ao buscar processos:", error, { id, service });
    return [];
  }
}
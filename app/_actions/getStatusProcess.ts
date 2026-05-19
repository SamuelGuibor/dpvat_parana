'use server';

import { fetchProcessesByUserId } from "@/app/_lib/db/processes";

interface UserProcess {
  id: string;
  name: string | null;
  type: string | null;
  service: string | null;
}

export async function getStatusProcess(userId: string): Promise<UserProcess[]> {
  try {
    return await fetchProcessesByUserId(userId);
  } catch (error) {
    console.error("Erro ao buscar processos:", error);
    return [];
  }
}

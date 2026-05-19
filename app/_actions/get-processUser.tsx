"use server";

import { fetchProcessesWithUser } from "@/app/_lib/db/processes";

export async function getProcessesByUser() {
  try {
    return await fetchProcessesWithUser();
  } catch (error) {
    console.error("Erro ao buscar processos:", error);
    throw new Error("Erro ao buscar processos");
  }
}

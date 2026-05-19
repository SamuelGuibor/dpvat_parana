"use server";

import { fetchUsersByRole } from "@/app/_lib/db/users";

interface Contato {
  nome: string;
  telefone: string;
}

export async function getContatosPorRole(role: string): Promise<Contato[]> {
  const users = await fetchUsersByRole(role);
  return users.map((u) => ({ nome: u.name ?? "", telefone: u.telefone ?? "" }));
}

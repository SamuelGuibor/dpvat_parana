'use server';

import { fetchUserById } from "@/app/_lib/db/users";

interface UserStatus {
  id: string;
  name: string | null;
  service: string | null;
}

export async function getStatus(id: string): Promise<UserStatus[]> {
  try {
    const user = await fetchUserById(id);
    if (!user) return [];
    return [{ id: user.id, name: user.name ?? null, service: user.service ?? null }];
  } catch (error) {
    console.error("Erro ao buscar status do usuário:", error, { id });
    return [];
  }
}

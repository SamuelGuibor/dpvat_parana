/* eslint-disable @typescript-eslint/no-explicit-any */
"use server";

import { db } from "../_lib/prisma";

interface Contato {
  nome: string;
  telefone: string;
}

export async function getContatosPorRole(role: string): Promise<Contato[]> {
  const usuarios = await db.user.findMany({
    where: {
      role,
    },
    select: {
      name: true,
      telefone: true,
    },
  });

  return usuarios.map((user: any) => ({
    nome: user.name, 
    telefone: user.telefone,
  }));
}
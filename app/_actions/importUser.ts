"use server";

import { db } from "../_lib/prisma";

type Row = {
  cpf?: string;
  nome?: string;
  email?: string;
  rua?: string;
  bairro?: string;
  numero?: string;
  cep?: string;
  cidade?: string;
  estado?: string;
  telefone?: string;
};

export async function importUsers(rows: Row[]) {
  for (const row of rows) {
    if (!row.email) continue; // email é obrigatório

    await db.user.upsert({
      where: { email: row.email },
      update: {
        cpf: row.cpf,
        rua: row.rua,
        bairro: row.bairro,
        numero: row.numero,
        cep: row.cep,
        cidade: row.cidade,
        estado: row.estado,
        telefone: row.telefone,
      },
      create: {
        email: row.email,
        name: row.nome,
        cpf: row.cpf,
        rua: row.rua,
        bairro: row.bairro,
        numero: row.numero,
        cep: row.cep,
        cidade: row.cidade,
        estado: row.estado,
        telefone: row.telefone,
        password: null, // ou gerar depois
      },
    });
  }

  return { success: true };
}

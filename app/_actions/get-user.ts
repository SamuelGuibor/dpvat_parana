"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";
import { format } from "date-fns"; // Importe o date-fns para formatar a data

interface getUserProfile {
  cpf: string;
  data_nasc: string;
  rua: string;
  bairro: string;
  numero: string;
  cep: string;
}

export async function getUser(data: getUserProfile) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado.");
  }

  const user = await db.user.findUnique({
    where: {
      email: session.user.email,
    },
    select: {
      cpf: true,
      data_nasc: true,
      rua: true,
      bairro: true,
      numero: true,
      cep: true,
    },
  });

  if (!user) {
    throw new Error("Usuário não encontrado.");
  }

  return {
    cpf: user.cpf || "",
    data_nasc: user.data_nasc ? format(user.data_nasc, "yyyy-MM-dd") : "", // Converte Date para string
    rua: user.rua || "Rua",
    bairro: user.bairro || "",
    numero: user.numero || "",
    cep: user.cep || "",
  };
}
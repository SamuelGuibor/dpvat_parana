/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";
import { format } from "date-fns";

interface UserData {
  id: string;
  name: string;
  status: string;
  type: string;
  cpf: string;
  data_nasc: string;
  email: string;
  rua: string;
  bairro: string;
  numero: string;
  cep: string;
  rg: string;
  nome_mae: string;
  telefone: string;
  cidade: string;
  estado: string;
  estado_civil: string;
  profissao: string;
  nacionalidade: string;
  acidente?: {
    data_acidente: string;
    atendimento_via: string;
    hospital: string;
    outro_hospital: string;
    lesoes: string;
  };
}

export async function getUser(id: string): Promise<UserData> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado.");
  }

  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      role: true,
      cpf: true,
      data_nasc: true,
      email: true,
      rua: true,
      bairro: true,
      numero: true,
      cep: true,
      rg: true,
      nome_mae: true,
      telefone: true,
      cidade: true,
      estado: true,
      estado_civil: true,
      profissao: true,
      nacionalidade: true,
      acidente: {
        select: {
          data_acidente: true,
          atendimento_via: true,
          hospital: true,
          outro_hospital: true,
          lesoes: true,
        },
      },
    },
  });

  if (!user) {
    throw new Error("Usuário não encontrado.");
  }

  return {
    id: user.id,
    name: user.name || "Sem nome",
    status: user.status || "Sem status",
    type: user.role || "USER",
    cpf: user.cpf || "",
    data_nasc: user.data_nasc ? format(user.data_nasc, "yyyy-MM-dd") : "",
    email: user.email || "",
    rua: user.rua || "",
    bairro: user.bairro || "",
    numero: user.numero || "",
    cep: user.cep || "",
    rg: user.rg || "",
    nome_mae: user.nome_mae || "",
    telefone: user.telefone || "",
    cidade: user.cidade || "",
    estado: user.estado || "",
    estado_civil: user.estado_civil || "",
    profissao: user.profissao || "",
    nacionalidade: user.nacionalidade || "",
    acidente: user.acidente
      ? {
          data_acidente: user.acidente.data_acidente
            ? format(user.acidente.data_acidente, "yyyy-MM-dd")
            : "",
          atendimento_via: user.acidente.atendimento_via || "",
          hospital: user.acidente.hospital || "",
          outro_hospital: user.acidente.outro_hospital || "",
          lesoes: user.acidente.lesoes || "",
        }
      : undefined,
  };
}
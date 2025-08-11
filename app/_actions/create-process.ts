// app/_actions/create-process.ts
"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";
import { z } from "zod";

const createProcessSchema = z.object({
  userId: z.string(),
  type: z.string().optional(),
  data_acidente: z.string().optional(),
  atendimento_via: z.string().optional(),
  hospital: z.string().optional(),
  outro_hospital: z.string().optional(),
  lesoes: z.string().optional(),
  service: z.string().optional(),
});

export async function createProcess(data: {
  userId: string;
  type?: string;
  data_acidente?: string;
  atendimento_via?: string;
  hospital?: string;
  outro_hospital?: string;
  lesoes?: string;
  service: string;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado.");
  }

  const validatedData = createProcessSchema.parse(data);

  const user = await db.user.findUnique({
    where: { id: validatedData.userId },
    select: {
      id: true,
      name: true,
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
      nome_res: true,
      rg_res: true,
      cpf_res: true,
      estado_civil_res: true,
      profissao_res: true,
    },
  });

  if (!user) {
    throw new Error("Usuário não encontrado.");
  }

  const process = await db.process.create({
    data: {
      userId: validatedData.userId,
      name: user.name,
      cpf: user.cpf,
      data_nasc: user.data_nasc,
      email: user.email, 
      rua: user.rua,
      bairro: user.bairro,
      numero: user.numero,
      cep: user.cep,
      rg: user.rg,
      nome_mae: user.nome_mae,
      telefone: user.telefone,
      cidade: user.cidade,
      estado: user.estado,
      estado_civil: user.estado_civil,
      profissao: user.profissao,
      nacionalidade: user.nacionalidade,
      nome_res: user.nome_res,
      rg_res: user.rg_res,
      cpf_res: user.cpf_res,
      estado_civil_res: user.estado_civil_res,
      profissao_res: user.profissao_res,
      type: validatedData.type,
      data_acidente: validatedData.data_acidente
        ? new Date(validatedData.data_acidente)
        : undefined,
      atendimento_via: validatedData.atendimento_via,
      hospital: validatedData.hospital,
      outro_hospital: validatedData.outro_hospital,
      lesoes: validatedData.lesoes,
      status: "INICIADO",
      role: "Aplicar Filtro DPVAT",
      statusStartedAt: new Date(),
      service: validatedData.service
    },
  });

  return {
    id: process.id,
    userId: process.userId,
    type: process.type,
    status: process.status,
    service: process.service
  };
}
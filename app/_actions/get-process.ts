/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";
import { format } from "date-fns";

interface ProcessGet {
  id: string;
  name: string;
  status?: string;
  type: string;
  role: string;
  statusStartedAt?: string | null;
  cpf?: string;
  data_nasc?: string;
  email?: string;
  rua?: string;
  bairro?: string;
  numero?: string;
  cep?: string;
  rg?: string;
  nome_mae?: string;
  telefone?: string;
  cidade?: string;
  estado?: string;
  estado_civil?: string;
  profissao?: string;
  nacionalidade?: string;
  data_acidente?: string;
  atendimento_via?: string;
  hospital?: string;
  outro_hospital?: string;
  lesoes?: string;
  observacao?: string;
  service?: string
}

export async function getProcess(
  fields: "basic" | "full" = "basic",
  processId?: string
): Promise<ProcessGet[] | ProcessGet | null> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado.");
  }

  const selectFields =
    fields === "full"
      ? {
          id: true,
          name: true,
          status: true,
          role: true,
          statusStartedAt: true,
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
          data_acidente: true,
          atendimento_via: true,
          hospital: true,
          outro_hospital: true,
          lesoes: true,
          observacao: true,
          service: true
        }
      : {
          id: true,
          name: true,
          type: true,
          role: true,
          observacao: true,
          statusStartedAt: true,
          service: true
        };

  if (processId) {
    const process = await db.process.findUnique({
      where: { id: processId },
      select: selectFields,
    });

    if (!process) {
      return null;
    }

    return {
      id: process.id,
      name: process.name || "Sem nome",
      status: process.status || undefined,
      type: process.type || "",
      role: process.role || "PROCESS",
      observacao: process.observacao || "",
      statusStartedAt: process.statusStartedAt ? process.statusStartedAt.toISOString() : null,
      ...(fields === "full" && {
        cpf: process.cpf || "",
        data_nasc: process.data_nasc ? format(process.data_nasc, "yyyy-MM-dd") : "",
        email: process.email || "",
        rua: process.rua || "",
        bairro: process.bairro || "",
        numero: process.numero || "",
        cep: process.cep || "",
        rg: process.rg || "",
        nome_mae: process.nome_mae || "",
        telefone: process.telefone || "",
        cidade: process.cidade || "",
        estado: process.estado || "",
        estado_civil: process.estado_civil || "",
        profissao: process.profissao || "",
        nacionalidade: process.nacionalidade || "",
        data_acidente: process.data_acidente
          ? format(process.data_acidente, "yyyy-MM-dd")
          : "",
        atendimento_via: process.atendimento_via || "",
        hospital: process.hospital || "",
        outro_hospital: process.outro_hospital || "",
        lesoes: process.lesoes || "",
        observacao: process.observacao || "",
        service: process.service || "",
      }),
    };
  }

  const processes = await db.process.findMany({
    select: selectFields,
  });

  return processes.map((process) => ({
    id: process.id,
    name: process.name || "Sem nome",
    status: process.status || undefined,
    type: process.type || "",
    role: process.role || "PROCESS",
    observacao: process.observacao || "",
    statusStartedAt: process.statusStartedAt ? process.statusStartedAt.toISOString() : null,
    service: process.service || "DPVAT",
    ...(fields === "full" && {
      cpf: process.cpf || "",
      data_nasc: process.data_nasc ? format(process.data_nasc, "yyyy-MM-dd") : "",
      email: process.email || "",
      rua: process.rua || "",
      bairro: process.bairro || "",
      numero: process.numero || "",
      cep: process.cep || "",
      rg: process.rg || "",
      nome_mae: process.nome_mae || "",
      telefone: process.telefone || "",
      cidade: process.cidade || "",
      estado: process.estado || "",
      estado_civil: process.estado_civil || "",
      profissao: process.profissao || "",
      nacionalidade: process.nacionalidade || "",
      data_acidente: process.data_acidente
        ? format(process.data_acidente, "yyyy-MM-dd")
        : "",
      atendimento_via: process.atendimento_via || "",
      hospital: process.hospital || "",
      outro_hospital: process.outro_hospital || "",
      lesoes: process.lesoes || "",
      observacao: process.observacao || "",
      service: process.service || "DPVAT",
    }),
  }));
}
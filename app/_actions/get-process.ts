"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";
import { fetchProcesses, fetchProcessById } from "@/app/_lib/db/processes";

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
  service?: string;
  fixed?: boolean;
  roleFixed?: string;
  userId?: string;
  labelId?: string | null;
  label?: { id: string; name: string; color: string; timeLimitDays: number | null } | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProcess(process: any, fields: "basic" | "full"): ProcessGet {
  return {
    id: process.id,
    name: process.name || "Sem nome",
    status: process.status || undefined,
    userId: process.userId,
    labelId: process.labelId ?? null,
    label: process.label ?? null,
    type: process.type || "",
    role: process.role || "PROCESS",
    observacao: process.observacao || "",
    fixed: process.fixed ?? false,
    roleFixed: process.roleFixed || "",
    service: process.service || "",
    statusStartedAt: process.statusStartedAt ? process.statusStartedAt.toISOString() : null,
    ...(fields === "full" && {
      cpf: process.cpf || "",
      data_nasc: process.data_nasc || "",
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
      data_acidente: process.data_acidente || "",
      atendimento_via: process.atendimento_via || "",
      hospital: process.hospital || "",
      outro_hospital: process.outro_hospital || "",
      lesoes: process.lesoes || "",
      observacao: process.observacao || "",
      service: process.service || "",
    }),
  };
}

export async function getProcess(
  fields: "basic" | "full" = "basic",
  processId?: string
): Promise<ProcessGet[] | ProcessGet | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Usuário não autenticado.");

  if (processId) {
    const process = await fetchProcessById(processId, fields);
    if (!process) return null;
    return mapProcess(process, fields);
  }

  const processes = await fetchProcesses();
  return processes.map((p) => mapProcess(p, fields));
}

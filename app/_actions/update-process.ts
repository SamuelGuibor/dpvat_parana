"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";

const VALID_STATUSES = ["INICIADO", "AGUARDANDO_ASSINATURA", "SOLICITAR_DOCUMENTOS", "COLETA_DOCUMENTOS", "ANALISE_DOCUMENTOS", "PERICIAL", "AGUARDANDO_PERICIAL", "PAGAMENTO_HONORARIO", "PROCESSO_ENCERRADO"] as const;
type Status = typeof VALID_STATUSES[number];

interface UpdateProcessData {
  id: string;
  name?: string;
  cpf?: string;
  data_nasc?: string;
  email?: string;
  nome_res?: string;
  rg_res?: string;
  cpf_res?: string;
  estado_civil_res?: string;
  profissao_res?: string;
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
  status?: string;
  role?: string;
  service?: string;
  obs?: string;
}

function mapStringToStatus(status: string | undefined): Status | undefined {
  if (!status) return undefined;

  if (!VALID_STATUSES.includes(status as Status)) {
    throw new Error(`Status inválido: ${status}`);
  }

  return status as Status;
}

export async function updateProcess(data: UpdateProcessData) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado.");
  }

  try {
    // Fetch the current process to compare the role
    const currentProcess = await db.process.findUnique({
      where: { id: data.id },
      select: { role: true, statusStartedAt: true },
    });

    if (!currentProcess) {
      throw new Error("Processo não encontrado.");
    }

    const shouldUpdateTimer = data.role && data.role !== currentProcess.role;

    const updatedProcess = await db.process.update({
      where: { id: data.id },
      data: {
        name: data.name,
        cpf: data.cpf,
        data_nasc: data.data_nasc ? new Date(data.data_nasc) : undefined,
        email: data.email,
        rua: data.rua,
        nome_res: data.nome_res,
        rg_res: data.rg_res,
        cpf_res: data.cpf_res,
        estado_civil_res: data.estado_civil_res,
        profissao_res: data.profissao_res,
        bairro: data.bairro,
        numero: data.numero,
        cep: data.cep,
        rg: data.rg,
        nome_mae: data.nome_mae,
        telefone: data.telefone,
        cidade: data.cidade,
        estado: data.estado,
        estado_civil: data.estado_civil,
        profissao: data.profissao,
        nacionalidade: data.nacionalidade,
        data_acidente: data.data_acidente ? new Date(data.data_acidente) : undefined,
        atendimento_via: data.atendimento_via,
        hospital: data.hospital,
        outro_hospital: data.outro_hospital,
        lesoes: data.lesoes,
        status: mapStringToStatus(data.status),
        role: data.role,
        statusStartedAt: shouldUpdateTimer ? new Date() : currentProcess.statusStartedAt,
        observacao: data.obs,
        service: data.service
      },
    });

    return {
      id: updatedProcess.id,
      name: updatedProcess.name || "",
      status: updatedProcess.status || undefined,
      type: updatedProcess.role || "PROCESS",
      role: updatedProcess.role || "PROCESS",
      statusStartedAt: updatedProcess.statusStartedAt ? updatedProcess.statusStartedAt.toISOString() : null,
      nome_res: updatedProcess.nome_res || "",
      rg_res: updatedProcess.rg_res || "",
      cpf_res: updatedProcess.cpf_res || "",
      estado_civil_res: updatedProcess.estado_civil_res || "",
      profissao_res: updatedProcess.profissao_res || "",
      cpf: updatedProcess.cpf || "",
      data_nasc: updatedProcess.data_nasc ? updatedProcess.data_nasc.toISOString().split("T")[0] : "",
      email: updatedProcess.email || "",
      rua: updatedProcess.rua || "",
      bairro: updatedProcess.bairro || "",
      numero: updatedProcess.numero || "",
      cep: updatedProcess.cep || "",
      rg: updatedProcess.rg || "",
      nome_mae: updatedProcess.nome_mae || "",
      telefone: updatedProcess.telefone || "",
      cidade: updatedProcess.cidade || "",
      estado: updatedProcess.estado || "",
      estado_civil: updatedProcess.estado_civil || "",
      profissao: updatedProcess.profissao || "",
      nacionalidade: updatedProcess.nacionalidade || "",
      data_acidente: updatedProcess.data_acidente ? updatedProcess.data_acidente.toISOString().split("T")[0] : "",
      atendimento_via: updatedProcess.atendimento_via || "",
      hospital: updatedProcess.hospital || "",
      outro_hospital: updatedProcess.outro_hospital || "",
      lesoes: updatedProcess.lesoes || "",
      obs: updatedProcess.observacao || "",
      service: updatedProcess.service || ""
    };
  } catch (error) {
    console.error("Erro ao atualizar processo:", error);
    throw new Error("Não foi possível atualizar os dados do processo.");
  }
}
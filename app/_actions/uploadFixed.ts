"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";

interface UpdateUserData {
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
  roleFixed?: string;
  service?: string;
  obs?: string;
}


export async function uploadFixed(data: UpdateUserData) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado.");
  }

  try {
    const currentUser = await db.user.findUnique({
      where: { id: data.id },
      select: { roleFixed: true },
    });

    if (!currentUser) {
      throw new Error("Usuário não encontrado.");
    }

    const updatedUser = await db.user.update({
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
        roleFixed: data.roleFixed,
        service: data.service,
        obs: data.obs,
      },
    });

    return {
      id: updatedUser.id,
      name: updatedUser.name || "",
      type: updatedUser.roleFixed || "USER",
      roleFixed: updatedUser.roleFixed || "USER",
      nome_res: updatedUser.nome_res || "",
      rg_res: updatedUser.rg_res || "",
      cpf_res: updatedUser.cpf_res || "",
      estado_civil_res: updatedUser.estado_civil_res || "",
      profissao_res: updatedUser.profissao_res || "",
      cpf: updatedUser.cpf || "",
      data_nasc: updatedUser.data_nasc ? updatedUser.data_nasc.toISOString().split("T")[0] : "",
      email: updatedUser.email || "",
      rua: updatedUser.rua || "",
      bairro: updatedUser.bairro || "",
      numero: updatedUser.numero || "",
      cep: updatedUser.cep || "",
      rg: updatedUser.rg || "",
      nome_mae: updatedUser.nome_mae || "",
      telefone: updatedUser.telefone || "",
      cidade: updatedUser.cidade || "",
      estado: updatedUser.estado || "",
      estado_civil: updatedUser.estado_civil || "",
      profissao: updatedUser.profissao || "",
      nacionalidade: updatedUser.nacionalidade || "",
      data_acidente: updatedUser.data_acidente ? updatedUser.data_acidente.toISOString().split("T")[0] : "",
      atendimento_via: updatedUser.atendimento_via || "",
      hospital: updatedUser.hospital || "",
      outro_hospital: updatedUser.outro_hospital || "",
      lesoes: updatedUser.lesoes || "",
      service: updatedUser.service || "",
      obs: updatedUser.obs || "",
    };
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    throw new Error("Não foi possível atualizar os dados do usuário.");
  }
}
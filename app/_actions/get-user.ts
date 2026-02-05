/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";
import { format } from "date-fns";
import { unstable_noStore as noStore } from "next/cache";

interface UserData {
  id: string;
  name: string;
  status?: string;
  type: string;
  role: string;
  statusStartedAt?: string | null; // Adicionado
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
  obs?: string;
  service?: string;
  fixed?: boolean;
  roleFixed?: string;
}

export async function getUsers(
  fields: "basic" | "full" = "basic",
  userId?: string
): Promise<UserData[] | UserData | null> {
  noStore();
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
          obs: true,
          service: true,
          fixed: true,
          roleFixed: true,
        }
      : {
          id: true,
          name: true,
          role: true,
          obs: true,
          service: true,
          statusStartedAt: true,
          fixed: true,
          roleFixed: true,
        };

  if (userId) {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: selectFields,
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      name: user.name || "Sem nome",
      status: user.status || undefined,
      type: user.role || "USER",
      role: user.role || "USER",
      obs: user.obs || "",
      service: user.service || "",
      fixed: user.fixed ?? false,
      roleFixed: user.roleFixed || "",
      statusStartedAt: user.statusStartedAt ? user.statusStartedAt.toISOString() : null, // Adicionado
      ...(fields === "full" && {
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
        data_acidente: user.data_acidente
          ? format(user.data_acidente, "yyyy-MM-dd")
          : "",
        atendimento_via: user.atendimento_via || "",
        hospital: user.hospital || "",
        outro_hospital: user.outro_hospital || "",
        lesoes: user.lesoes || "",
        obs: user.obs || "",
        service: user.service || "",
      }),
    };
  }

  const users = await db.user.findMany({
    select: selectFields,
  });

  return users.map((user) => ({
    id: user.id,
    name: user.name || "Sem nome",
    status: user.status || undefined,
    type: user.role || "USER",
    role: user.role || "USER",
    obs: user.obs || "",
    service: user.service || "",
    fixed: user.fixed ?? false,
    roleFixed: user.roleFixed || "",
    statusStartedAt: user.statusStartedAt ? user.statusStartedAt.toISOString() : null, // Adicionado
    ...(fields === "full" && {
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
      data_acidente: user.data_acidente
        ? format(user.data_acidente, "yyyy-MM-dd")
        : "",
      atendimento_via: user.atendimento_via || "",
      hospital: user.hospital || "",
      outro_hospital: user.outro_hospital || "",
      lesoes: user.lesoes || "",
      obs: user.obs || "",
      service: user.service || "",
    }),
  }));
}
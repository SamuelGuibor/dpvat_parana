"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";
import { format } from "date-fns";
import { unstable_noStore as noStore } from "next/cache";
import { fetchUsers, fetchUserById } from "@/app/_lib/db/users";

interface UserData {
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
  obs?: string;
  service?: string;
  fixed?: boolean;
  roleFixed?: string;
  labelId?: string | null;
  label?: { id: string; name: string; color: string; timeLimitDays: number | null } | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapUser(user: any, fields: "basic" | "full"): UserData {
  return {
    id: user.id,
    name: user.name || "Sem nome",
    status: user.status || undefined,
    labelId: user.labelId ?? null,
    label: user.label ?? null,
    type: user.role || "USER",
    role: user.role || "USER",
    obs: user.obs || "",
    service: user.service || "",
    fixed: user.fixed ?? false,
    roleFixed: user.roleFixed || "",
    statusStartedAt: user.statusStartedAt ? user.statusStartedAt.toISOString() : null,
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
      data_acidente: user.data_acidente ? format(user.data_acidente, "yyyy-MM-dd") : "",
      atendimento_via: user.atendimento_via || "",
      hospital: user.hospital || "",
      outro_hospital: user.outro_hospital || "",
      lesoes: user.lesoes || "",
      obs: user.obs || "",
      service: user.service || "",
    }),
  };
}

export async function getUsers(
  fields: "basic" | "full" = "basic",
  userId?: string
): Promise<UserData[] | UserData | null> {
  noStore();
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Usuário não autenticado.");

  if (userId) {
    const user = await fetchUserById(userId, fields);
    if (!user) return null;
    return mapUser(user, fields);
  }

  const users = await fetchUsers();
  return users.map((u) => mapUser(u, fields));
}

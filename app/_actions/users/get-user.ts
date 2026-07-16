"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "../../_shared/lib/auth";
import { unstable_noStore as noStore } from "next/cache";
import { fetchUsers, fetchUserById } from "@/app/_shared/lib/db/users";

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
  telefone_secundario?: string;
  rede_social?: string;
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
  otherObs?: string;
  service?: string;
  fixed?: boolean;
  roleFixed?: string;
  labelId?: string | null;
  label?: { id: string; name: string; color: string; timeLimitDays: number | null } | null;
  senha_inss?: string;
  cardNumber?: number | null;
  afastadoAte?: string | null;
  archiveStatus?: string | null;
  boardOrder?: number | null;
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
    cardNumber: user.cardNumber ?? null,
    afastadoAte: user.afastadoAte ? user.afastadoAte.toISOString() : null,
    archiveStatus: user.archiveStatus ?? null,
    boardOrder: user.boardOrder ?? null,
    ...(fields === "full" && {
      cpf: user.cpf || "",
      data_nasc: user.data_nasc || "",
      email: user.email || "",
      rua: user.rua || "",
      bairro: user.bairro || "",
      numero: user.numero || "",
      cep: user.cep || "",
      rg: user.rg || "",
      nome_mae: user.nome_mae || "",
      telefone: user.telefone || "",
      telefone_secundario: user.telefone_secundario || "",
      rede_social: user.rede_social || "",
      cidade: user.cidade || "",
      estado: user.estado || "",
      estado_civil: user.estado_civil || "",
      profissao: user.profissao || "",
      nacionalidade: user.nacionalidade || "",
      data_acidente: user.data_acidente || "",
      atendimento_via: user.atendimento_via || "",
      hospital: user.hospital || "",
      outro_hospital: user.outro_hospital || "",
      lesoes: user.lesoes || "",
      obs: user.obs || "",
      otherObs: user.otherObs || "",
      service: user.service || "",
      senha_inss: user.senha_inss || "",
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

import { db } from "@/app/_lib/prisma";

const userBasicSelect = {
  id: true,
  name: true,
  role: true,
  roleFixed: true,
  labelId: true,
  label: { select: { id: true, name: true, color: true, timeLimitDays: true } },
  statusStartedAt: true,
  service: true,
  obs: true,
  fixed: true,
  status: true,
  cardNumber: true,
  afastadoAte: true,
};

const userFullSelect = {
  id: true,
  name: true,
  role: true,
  roleFixed: true,
  labelId: true,
  label: { select: { id: true, name: true, color: true, timeLimitDays: true } },
  statusStartedAt: true,
  status: true,
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
  otherObs: true,
  service: true,
  fixed: true,
  senha_inss: true,
  cardNumber: true,
  afastadoAte: true,
};

export async function fetchUsers(options?: { role?: string }) {
  return db.user.findMany({
    orderBy: { createdAt: "asc" },
    where: options?.role
      ? { role: options.role }
      : { role: { not: 'GHOST' } },
    select: userBasicSelect,
  });
}

export async function fetchUserById(id: string, fields: "basic" | "full" = "basic") {
  return db.user.findUnique({
    where: { id },
    select: fields === "full" ? userFullSelect : userBasicSelect,
  });
}

export async function fetchUsersByRole(role: string) {
  return db.user.findMany({
    where: { role },
    select: { id: true, name: true, telefone: true, service: true },
  });
}

export async function fetchUserByPhone(telefone: string) {
  return db.user.findFirst({
    where: { telefone },
    select: { id: true, name: true },
  });
}

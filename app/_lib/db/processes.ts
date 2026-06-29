import { db } from "@/app/_lib/prisma";

const processBasicSelect = {
  id: true,
  name: true,
  userId: true,
  type: true,
  role: true,
  roleFixed: true,
  labelId: true,
  label: { select: { id: true, name: true, color: true, timeLimitDays: true } },
  statusStartedAt: true,
  service: true,
  observacao: true,
  fixed: true,
  status: true,
  cardNumber: true,
  afastadoAte: true,
};

const processFullSelect = {
  id: true,
  name: true,
  userId: true,
  type: true,
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
  observacao: true,
  otherObs: true,
  service: true,
  fixed: true,
  senha_inss: true,
  cardNumber: true,
  afastadoAte: true,
};

export async function fetchProcesses() {
  return db.process.findMany({ orderBy: { createdAt: "asc" }, select: processBasicSelect });
}

export async function fetchProcessById(id: string, fields: "basic" | "full" = "basic") {
  return db.process.findUnique({
    where: { id },
    select: fields === "full" ? processFullSelect : processBasicSelect,
  });
}

export async function fetchProcessesWithUser() {
  return db.process.findMany({
    include: {
      user: { select: { id: true, name: true, role: true } },
    },
  });
}

export async function fetchProcessesByUserId(userId: string) {
  return db.process.findMany({
    where: { userId },
    select: { id: true, name: true, type: true, service: true },
  });
}

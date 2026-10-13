// Cria um membro da equipe em "Somente visualização" (13/10/2026 — Caíque).
// Cargo ADMIN+ (Kanban, Tickets) + overrides: vê Visão do Gestor, Números,
// Segurança, Cérebro da IA, menções de todos, ponto da equipe, acesso fora do
// escritório; SEM Whats IA, sem arquivados/pagos e travado em read_only (o
// servidor recusa mover/editar/comentar/subir/alterar).
//
// A senha é gerada aqui e impressa UMA vez no terminal — entregue ao usuário.
//
//   node scripts/criar-usuario-leitura.mjs --nome "Caíque" --cpf 00000000000 [--email x@y.com] [--senha ...]

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

const nome = arg("nome");
const cpf = (arg("cpf") ?? "").replace(/\D/g, "");
const email = arg("email")?.trim() || `${cpf}@inserir-email.com`;
if (!nome || cpf.length !== 11) {
  console.error('Uso: node scripts/criar-usuario-leitura.mjs --nome "Nome" --cpf 00000000000 [--email x@y.com]');
  process.exit(1);
}

// Só o que DIFERE do padrão do ADMIN+ (mesma regra do diffFromDefaults).
const PERMISSIONS = {
  read_only: true,
  view_whatsapp: false,
  manager_dashboard: true,
  manage_wa_numbers: true,
  view_security: true,
  view_ai_brain: true,
  view_all_mentions: true,
  manage_ponto: true,
  bypass_ip_lock: true,
  // ADMIN+ nasce com estes; usuário de leitura não precisa.
  view_archived: false,
  view_pagos_caique: false,
  view_pagos_uni: false,
  archive_cards: false,
  delete_cards: false,
  manage_automations: false,
  create_columns: false,
  edit_columns: false,
  delete_columns: false,
  create_hospitals: false,
  run_ai_audit: false,
  manage_contracts: false,
};

const db = new PrismaClient();
try {
  const dup = await db.user.findFirst({ where: { OR: [{ cpf }, { email }] }, select: { id: true, name: true } });
  if (dup) {
    console.error(`Já existe usuário com esse CPF/e-mail: ${dup.name} (${dup.id}). Nada foi criado.`);
    process.exit(1);
  }
  const senha = arg("senha") || randomBytes(9).toString("base64url");
  const last = await db.user.findFirst({ where: { cardNumber: { not: null } }, orderBy: { cardNumber: "desc" }, select: { cardNumber: true } });
  const user = await db.user.create({
    data: {
      name: nome,
      cpf,
      email,
      password: await bcrypt.hash(senha, 10),
      role: "ADMIN+",
      labelId: null,
      cardNumber: (last?.cardNumber ?? 0) + 1,
      permissions: PERMISSIONS,
    },
    select: { id: true },
  });
  console.log(`Criado: ${nome} (${user.id})`);
  console.log(`Login (CPF): ${cpf}`);
  if (!arg("senha")) console.log(`Senha provisória: ${senha}`);
} finally {
  await db.$disconnect();
}

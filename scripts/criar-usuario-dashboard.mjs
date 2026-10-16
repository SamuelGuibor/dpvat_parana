// Cria um membro da equipe (ADMIN) restrito ao Analytics do Dashboard
// (override dashboard_only + read_only, sem inbox nem ações de card).
// Uso: node scripts/criar-usuario-dashboard.mjs "<nome>" <cpf> <senha>
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const [name, rawCpf, password] = process.argv.slice(2);
if (!name || !rawCpf || !password) {
  console.error('Uso: node scripts/criar-usuario-dashboard.mjs "<nome>" <cpf> <senha>');
  process.exit(1);
}
const cpf = rawCpf.replace(/\D/g, '');
const db = new PrismaClient();

const dup = await db.user.findFirst({ where: { cpf, password: { not: null } }, select: { id: true, name: true } });
if (dup) {
  console.error(`CPF já tem login: ${dup.name} (${dup.id})`);
  process.exit(1);
}

const permissions = {
  dashboard_only: true,
  read_only: true,
  view_whatsapp: false,
  run_ai_audit: false,
  delete_cards: false,
  manage_automations: false,
  create_columns: false,
  edit_columns: false,
  delete_columns: false,
  manage_contracts: false,
};

const user = await db.user.create({
  data: { name, cpf, email: `${cpf}@inserir-email.com`, role: 'ADMIN', password: await bcrypt.hash(password, 10), permissions },
  select: { id: true, name: true, role: true, email: true },
});
console.log('Criado:', user);
await db.$disconnect();

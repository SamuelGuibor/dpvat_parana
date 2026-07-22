// Bootstrap do sistema de permissões (rodar UMA vez após a migration
// user_permissions_and_password_reset):
//
//  1. Promove o dono (Samuel) a ADMIN++ — sem isso ninguém consegue gerenciar
//     cargos/permissões (UpdateRole agora exige ADMIN++ de verdade).
//  2. Converte as antigas allowlists hardcoded (ALLOWED_ARCHIVE_USERS /
//     ALLOWED_TICKETS_USERS de page.tsx + KanbanBoard.tsx) em overrides no
//     banco, para ninguém perder acesso na virada.
//  3. Marca manager_dashboard=true para os e-mails de gestor (a allowlist de
//     e-mails continua valendo como fallback, mas assim fica visível e
//     editável na tela de Equipe).
//
// Idempotente: pode rodar de novo sem efeito colateral.
//
//   node scripts/bootstrap-permissions.mjs

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const SUPER_ADMIN_ID = "cmazo6j870000ia0gw5ppb486"; // Samuel ("eu" nas listas antigas)

// União das listas antigas (page.tsx tinha 4; KanbanBoard.tsx tinha 6).
const OVERRIDES = {
  cmqp5w7hd000dl404atfj5mrd: { view_archived: true, archive_cards: true, view_tickets: true },
  cmazuwrcj0000iav499hqf5ij: { view_archived: true, archive_cards: true, view_tickets: true },
  cmpwucq210001jv041oc9twsr: { view_archived: true, archive_cards: true, view_tickets: true }, // daniel
  cmqp55x1b0007l404d00r4gy8: { archive_cards: true },
  cmqp57px0000bl404oewmkgxn: { archive_cards: true },
};

const MANAGER_EMAILS = [
  "martinez.thomaz@segurosparana.com.br",
  "nikolas.paranaseguros@gmail.com",
  "daniel.paranaseguros@gmail.com",
  "luana.paranaseguros@gmail.com",
  "eduardocamargomartinez8@gmail.com",
];

function mergedPermissions(existing, extra) {
  const base = existing && typeof existing === "object" && !Array.isArray(existing) ? existing : {};
  return { ...base, ...extra };
}

async function main() {
  const owner = await db.user.update({
    where: { id: SUPER_ADMIN_ID },
    data: { role: "ADMIN++" },
    select: { name: true, email: true, role: true },
  });
  console.log(`✔ ${owner.name} (${owner.email}) agora é ${owner.role}`);

  for (const [id, extra] of Object.entries(OVERRIDES)) {
    const user = await db.user.findUnique({ where: { id }, select: { name: true, permissions: true, role: true } });
    if (!user) {
      console.log(`— usuário ${id} não encontrado, pulando`);
      continue;
    }
    if (user.role === "ADMIN++") {
      console.log(`— ${user.name} é ADMIN++ (acesso total), sem override`);
      continue;
    }
    await db.user.update({ where: { id }, data: { permissions: mergedPermissions(user.permissions, extra) } });
    console.log(`✔ overrides de ${user.name}: ${JSON.stringify(extra)}`);
  }

  for (const email of MANAGER_EMAILS) {
    const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true, permissions: true, role: true } });
    if (!user) {
      console.log(`— gestor ${email} não encontrado, pulando`);
      continue;
    }
    if (user.role === "ADMIN++") continue;
    await db.user.update({
      where: { id: user.id },
      data: { permissions: mergedPermissions(user.permissions, { manager_dashboard: true }) },
    });
    console.log(`✔ manager_dashboard=true para ${user.name} (${email})`);
  }

  console.log("Bootstrap concluído.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

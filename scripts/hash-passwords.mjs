// Migra TODAS as senhas legadas (texto puro) do banco para hash bcrypt.
// A migração lazy no login já cobre quem loga, mas este script fecha o buraco
// de uma vez: depois dele, nenhum registro em `users.password` fica legível.
//
// Uso:  node scripts/hash-passwords.mjs           (dry-run: só mostra a contagem)
//       node scripts/hash-passwords.mjs --apply   (grava os hashes)

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const BCRYPT_PREFIX = /^\$2[aby]\$/;

const users = await db.user.findMany({
  where: { password: { not: null } },
  select: { id: true, password: true },
});

const legacy = users.filter((u) => u.password && !BCRYPT_PREFIX.test(u.password));
console.log(`${users.length} usuários com senha; ${legacy.length} ainda em texto puro.`);

if (!APPLY) {
  console.log("Dry-run: nada foi alterado. Rode com --apply para migrar.");
  process.exit(0);
}

let done = 0;
for (const user of legacy) {
  const hashed = await bcrypt.hash(user.password, 10);
  await db.user.update({ where: { id: user.id }, data: { password: hashed } });
  done++;
  if (done % 50 === 0) console.log(`${done}/${legacy.length}...`);
}

console.log(`Concluído: ${done} senhas migradas para bcrypt.`);
await db.$disconnect();

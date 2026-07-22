// Normalização única dos campos com máscara no banco: CPF/telefone/CEP
// passam a ser SÓ DÍGITOS (a UI formata na exibição).
//
// Motivos: (1) buscas por dígitos ("contains") não acham valores mascarados;
// (2) o login por CPF compara dígitos; (3) o WhatsApp casa telefone por
// dígitos. Idempotente: rodar de novo não muda nada.
//
//   node scripts/normalize-docs.mjs

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const FIELDS = ["cpf", "cpf_res", "telefone", "telefone_secundario", "cep"];

async function normalizeTable(table) {
  let total = 0;
  for (const f of FIELDS) {
    const result = await db.$executeRawUnsafe(
      `UPDATE "${table}" SET "${f}" = regexp_replace("${f}", '\\D', '', 'g') WHERE "${f}" ~ '\\D'`,
    );
    if (result > 0) console.log(`  ${table}.${f}: ${result} registro(s) normalizados`);
    total += result;
  }
  return total;
}

async function main() {
  console.log("Normalizando User...");
  const u = await normalizeTable("User");
  console.log("Normalizando Process...");
  const p = await normalizeTable("Process");
  console.log(`Concluído: ${u + p} campos normalizados no total.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

// Apaga os cards AUTOMÁTICOS do quadro Cérebro APP (tipos LACUNA e
// DESATUALIZADO, criados pelo botão "Gerar cards automáticos"). Não toca em
// ticket comum nem em card de conhecimento sugerido por pessoa.
//
// Uso (PRODUÇÃO: o .env aponta para o Neon):
//   node -r dotenv/config scripts/cerebro-limpar-automaticos.mjs           # dry-run: lista
//   node -r dotenv/config scripts/cerebro-limpar-automaticos.mjs --apply   # apaga
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const AUTO = { type: { in: ["LACUNA", "DESATUALIZADO"] }, creatorName: { in: ["Relatório de lacunas", "Checagem do vault"] } };

const db = new PrismaClient();
try {
  const rows = await db.devTicket.findMany({
    where: AUTO,
    select: { id: true, type: true, status: true, title: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const porTipo = {};
  for (const r of rows) porTipo[`${r.type}/${r.status}`] = (porTipo[`${r.type}/${r.status}`] ?? 0) + 1;
  console.log(`Cards automáticos: ${rows.length}`, porTipo);
  for (const r of rows.slice(0, 60)) console.log(`  ${r.type.padEnd(13)} ${r.status.padEnd(16)} ${r.title}`);
  if (!APPLY) {
    console.log("Dry-run: nada apagado (use --apply).");
  } else {
    const res = await db.devTicket.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    console.log(`Apagados: ${res.count}`);
  }
} finally {
  await db.$disconnect();
}

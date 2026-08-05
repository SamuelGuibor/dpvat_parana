// PEGADINHA: insere 10.000 logs falsos (mas plausíveis) para a Isadora
// disparar no ranking da Visão do Gestor. Todos os logs levam o marcador
// metadata.prank = "isadora-2026-08-05", então dá pra apagar tudo depois com:
//
//   node scripts/prank-isadora.mjs --undo
//
// Uso:  node scripts/prank-isadora.mjs           (insere os 10.000 logs)
//       node scripts/prank-isadora.mjs --undo    (remove TODOS os logs da pegadinha)

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const PRANK_TAG = "isadora-2026-08-05";
const TOTAL = 10_000;
const UNDO = process.argv.includes("--undo");

if (UNDO) {
  const res = await db.$executeRawUnsafe(
    `DELETE FROM logs WHERE metadata->>'prank' = $1`,
    PRANK_TAG,
  );
  console.log(`Removidos ${res} logs da pegadinha (${PRANK_TAG}).`);
  await db.$disconnect();
  process.exit(0);
}

// ---- localiza a Isadora ----
const isadora = await db.user.findFirst({
  where: {
    name: { contains: "isadora", mode: "insensitive" },
    role: { startsWith: "ADMIN" },
  },
  select: { id: true, name: true, sectorId: true, sector: { select: { name: true, slug: true } } },
});
if (!isadora) {
  console.error("Isadora não encontrada entre os usuários da equipe. Abortando.");
  process.exit(1);
}
console.log(`Isadora: ${isadora.name} (${isadora.id})`);

// ---- cards reais para os logs referenciarem ----
// Cards do kanban = registros de User cuja role é o nome da coluna.
const cards = await db.user.findMany({
  where: { role: { notIn: ["ADMIN", "ADMIN+", "ADMIN++", "GHOST"] }, name: { not: null } },
  select: { id: true, name: true, role: true },
  take: 400,
});
if (!cards.length) {
  console.error("Nenhum card encontrado. Abortando.");
  process.exit(1);
}
console.log(`${cards.length} cards disponíveis para referência.`);

const COLUNAS = [
  "FAZER ROTEIRO PREV",
  "REVISÃO PRÉ-PASTA | CAIQUE",
  "ENVIAR EMAIL UNI",
  "ENVIADOS P/ UNI",
  "PENDÊNCIAS JUDICIAL",
  "CARTÕES PARA NIKOLAS ANALISAR",
];

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];

function fakeDoc(clientName) {
  const kinds = [
    () => `roteiro_${clientName}.pdf`,
    () => `roteiro_${clientName} atualizado.pdf`,
    () => `${crypto.randomUUID()}.pdf`,
    () => `procuracao_${clientName}.pdf`,
    () => `laudo_${clientName}.pdf`,
    () => `CNIS_${clientName}.pdf`,
  ];
  return pick(kinds)();
}

// gera um evento plausível (action + message) para um card
function fakeEvent(card) {
  const clientName = card.name ?? "Cliente";
  const roll = Math.random();
  if (roll < 0.35) {
    const from = Math.random() < 0.5 && card.role ? card.role : pick(COLUNAS);
    let to = pick(COLUNAS);
    while (to === from) to = pick(COLUNAS);
    return { action: "move", message: `moveu de "${from}" para "${to}"` };
  }
  if (roll < 0.65) {
    return { action: "comment_add", message: "adicionou um comentário" };
  }
  if (roll < 0.85) {
    return { action: "document_add", message: `adicionou o documento "${fakeDoc(clientName)}"` };
  }
  if (roll < 0.92) {
    return { action: "document_remove", message: `removeu o documento "${fakeDoc(clientName)}"` };
  }
  const campos = ["Telefone", "E-mail", "Cidade", "Observação", "Hospital", "Profissão"];
  return { action: "update", message: `alterou o campo ${pick(campos)}` };
}

// data aleatória nos últimos 10 dias, horário comercial (08h–19h), min/seg aleatórios
function fakeDate() {
  const d = new Date();
  d.setDate(d.getDate() - rand(10));
  d.setHours(8 + rand(11), rand(60), rand(60), rand(1000));
  if (d > new Date()) d.setDate(d.getDate() - 1);
  return d;
}

const sectorMeta = isadora.sectorId
  ? {
      authorSectorId: isadora.sectorId,
      authorSectorName: isadora.sector?.name ?? null,
      authorSectorSlug: isadora.sector?.slug ?? null,
    }
  : {};

console.log(`Gerando ${TOTAL} logs...`);
const rows = [];
for (let i = 0; i < TOTAL; i++) {
  const card = pick(cards);
  const ev = fakeEvent(card);
  rows.push({
    action: ev.action,
    message: ev.message,
    authorId: isadora.id,
    authorName: isadora.name,
    userId: card.id,
    processId: null,
    createdAt: fakeDate(),
    metadata: { ...sectorMeta, prank: PRANK_TAG },
  });
}

// insere em lotes pra não estourar o payload
const BATCH = 1000;
let inserted = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const res = await db.log.createMany({ data: rows.slice(i, i + BATCH) });
  inserted += res.count;
  console.log(`  ${inserted}/${TOTAL}`);
}

console.log(`Pronto! ${inserted} logs inseridos para ${isadora.name}. 🏆`);
console.log(`Para desfazer: node scripts/prank-isadora.mjs --undo`);
await db.$disconnect();

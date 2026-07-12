// Registra a atividade de DESENVOLVIMENTO (commits do git) na tabela Log, para
// que o trabalho do dev apareça nos dashboards (Meu Espaço / Visão do Gestor)
// como a ação `dev_commit` — do mesmo jeito que uma criação/edição de card.
//
// Cada commit vira UMA linha de Log (honesto e auditável), com os números reais
// do git no metadata: arquivos alterados, linhas inseridas e removidas. A linha
// é datada no dia do commit (createdAt = data do commit), então cai no período
// e no heatmap corretos.
//
// NÃO infla a contagem: 1 commit = 1 ação. As linhas (+/−) ficam no metadata e
// aparecem como detalhe/《Desenvolvimento》, sem transformar cada linha de código
// num "ponto" que passaria por cima do trabalho de card dos colegas.
//
// Uso:
//   node scripts/log-dev-commits.mjs --email voce@exemplo.com --last 1
//   node scripts/log-dev-commits.mjs --email voce@exemplo.com --last 1 --apply
//   node scripts/log-dev-commits.mjs --author-id <userId> --range 9c68c3c..a9b50c6 --apply
//   node scripts/log-dev-commits.mjs --email voce@exemplo.com --since "2026-07-01" --git-author Samuel --apply
//
// Flags:
//   --email <e>        e-mail do usuário (dev) dono dos logs no app
//   --author-id <id>   alternativa ao --email: id do User direto
//   --range <A..B>     intervalo de commits (git rev range)
//   --last <N>         últimos N commits (padrão: 1)
//   --since <data>     commits desde a data (git --since)
//   --git-author <s>   filtra commits por autor no git (nome/e-mail)
//   --apply            grava de fato (sem isso é dry-run: só lista)

import { PrismaClient } from "@prisma/client";
import { execSync } from "node:child_process";

const db = new PrismaClient();

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const has = (name) => process.argv.includes(`--${name}`);

const APPLY = has("apply");
const email = arg("email");
const authorIdArg = arg("author-id");
const range = arg("range");
const last = Number(arg("last", "1"));
const since = arg("since");
const gitAuthor = arg("git-author");

function git(cmd) {
  return execSync(`git ${cmd}`, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();
}

async function resolveDev() {
  if (authorIdArg) {
    const u = await db.user.findUnique({ where: { id: authorIdArg }, select: { id: true, name: true } });
    if (!u) throw new Error(`Nenhum usuário com id "${authorIdArg}".`);
    return u;
  }
  if (email) {
    const u = await db.user.findUnique({ where: { email }, select: { id: true, name: true } });
    if (!u) throw new Error(`Nenhum usuário com e-mail "${email}".`);
    return u;
  }
  throw new Error("Informe --email <e-mail> ou --author-id <id> do dev.");
}

// Lista os hashes dos commits conforme os filtros.
function listCommits() {
  const parts = ["log", "--no-merges", "--format=%H"];
  if (gitAuthor) parts.push(`--author="${gitAuthor}"`);
  if (since) parts.push(`--since="${since}"`);
  if (range) parts.push(range);
  else if (!since) parts.push(`-n ${last}`);
  const out = git(parts.join(" "));
  return out ? out.split("\n").filter(Boolean) : [];
}

// Estatísticas reais de um commit (arquivos, inserções, remoções) via numstat.
function commitStats(hash) {
  const subject = git(`show -s --format=%s ${hash}`);
  const iso = git(`show -s --format=%cI ${hash}`); // data do commit (ISO)
  const numstat = git(`show --numstat --format="" ${hash}`);
  let insertions = 0, deletions = 0, files = 0;
  for (const line of numstat.split("\n")) {
    if (!line.trim()) continue;
    const [ins, del] = line.split("\t");
    files += 1;
    if (ins !== "-") insertions += Number(ins) || 0; // "-" = arquivo binário
    if (del !== "-") deletions += Number(del) || 0;
  }
  return { subject, committedAt: new Date(iso), insertions, deletions, files };
}

const dev = await resolveDev();
const hashes = listCommits();
if (!hashes.length) {
  console.log("Nenhum commit encontrado com esses filtros.");
  await db.$disconnect();
  process.exit(0);
}

// Dedup: não registra o mesmo commit duas vezes (usa o hash no metadata).
const existing = await db.log.findMany({
  where: { action: "dev_commit", authorId: dev.id },
  select: { metadata: true },
});
const seen = new Set(
  existing.map((l) => (l.metadata && typeof l.metadata === "object" ? l.metadata.hash : null)).filter(Boolean),
);

const toCreate = [];
for (const hash of hashes) {
  if (seen.has(hash)) continue;
  const s = commitStats(hash);
  toCreate.push({ hash, ...s });
}

console.log(`Dev: ${dev.name ?? dev.id}`);
console.log(`Commits encontrados: ${hashes.length} · novos (não registrados): ${toCreate.length}\n`);
for (const c of toCreate) {
  console.log(`  ${c.hash.slice(0, 7)}  +${c.insertions} −${c.deletions}  ${c.files} arq.  ${c.subject}`);
}

if (!toCreate.length) {
  console.log("\nNada novo para registrar.");
  await db.$disconnect();
  process.exit(0);
}

if (!APPLY) {
  console.log("\nDry-run: nada gravado. Rode com --apply para registrar os logs.");
  await db.$disconnect();
  process.exit(0);
}

for (const c of toCreate) {
  await db.log.create({
    data: {
      action: "dev_commit",
      message: `desenvolveu: ${c.subject} (+${c.insertions} −${c.deletions}, ${c.files} arq.)`,
      authorId: dev.id,
      authorName: dev.name ?? "Desenvolvedor",
      createdAt: c.committedAt, // cai no dia do commit (período/heatmap corretos)
      metadata: {
        source: "git",
        hash: c.hash,
        subject: c.subject,
        files: c.files,
        insertions: c.insertions,
        deletions: c.deletions,
        committedAt: c.committedAt.toISOString(),
        ...(gitAuthor ? { gitAuthor } : {}),
      },
    },
  });
}

console.log(`\nConcluído: ${toCreate.length} commit(s) registrado(s) como atividade de desenvolvimento.`);
await db.$disconnect();

// Validador determinístico do vault da operação (docs/operacao/). Etapa 2 do
// AI-First (docs/ai-first/02-plano-etapa-2.md §4). Roda ANTES do agente
// validador: nota que falha aqui nem chega a ele.
//
// Confere (regras em checkNote, app/_shared/utils/vault.ts):
//   - frontmatter completo e válido; `publicado` exige validado_por/publicado_por
//     e pendente_humano vazio;
//   - todo e-mail/telefone/link do corpo e do frontmatter aparece LITERAL na Fonte;
//   - wikilinks do `Mapa da Operação.md` existem;
//   - com --drift (lê o banco, READ ONLY): fonte_hash × hash atual da automação →
//     lista as notas cuja automação mudou, sumiu ou foi desativada.
//
// Uso:
//   node scripts/vault-check.mjs                         # todas as notas
//   node scripts/vault-check.mjs --arquivos=hospitais/a.md,hospitais/b.md
//   node -r dotenv/config scripts/vault-check.mjs --drift
//   ... --json                                           # saída para as skills
// Sai com código 1 se houver erro (o /validar usa isso).
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const SCRIPT = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ROOT = join(dirname(SCRIPT), "..");
const VAULT = join(ROOT, "docs/operacao");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);

const require = createRequire(import.meta.url);
const jitiMod = require("jiti");
const createJiti = jitiMod.createJiti ?? jitiMod.default ?? jitiMod;
const jiti = createJiti(SCRIPT, { interopDefault: true, cache: false });
const V = await (typeof jiti.import === "function"
  ? jiti.import("../app/_shared/utils/vault.ts")
  : jiti("../app/_shared/utils/vault.ts"));

if (!existsSync(VAULT)) {
  console.log("docs/operacao/ não existe: nada a checar.");
  process.exit(0);
}

const rel = (p) => relative(VAULT, p).replace(/\\/g, "/");
const todas = [];
const walk = (dir) => {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) walk(p);
    else if (d.name.endsWith(".md")) todas.push(rel(p));
  }
};
walk(VAULT);

// Notas = arquivos em subpastas, menos os relatórios gerados.
const isNota = (r) => r.includes("/") && !r.startsWith("_relatorios/");
const alvo =
  typeof args.arquivos === "string"
    ? args.arquivos.split(",").map((s) => s.trim().replace(/\\/g, "/").replace(/^docs\/operacao\//, "")).filter(Boolean)
    : todas.filter(isNota);

const resultado = { erros: {}, drift: [], links: [], verificadas: 0 };
const notas = new Map();
for (const r of alvo) {
  const abs = join(VAULT, r);
  if (!existsSync(abs)) {
    resultado.erros[r] = ["arquivo não existe"];
    continue;
  }
  const text = readFileSync(abs, "utf8");
  notas.set(r, text);
  resultado.verificadas++;
  const errs = V.checkNote(r, text);
  if (errs.length) resultado.erros[r] = errs;
}

// Wikilinks do índice.
const indice = join(VAULT, "Mapa da Operação.md");
if (existsSync(indice) && typeof args.arquivos !== "string") {
  const existentes = new Set(todas.map((t) => t.replace(/\.md$/, "")));
  for (const l of V.wikilinks(readFileSync(indice, "utf8"))) if (!existentes.has(l)) resultado.links.push(l);
}

// Drift: hash gravado × hash da automação viva.
if (args.drift) {
  const { PrismaClient } = await import("@prisma/client");
  const porNota = new Map();
  for (const [r, text] of notas) {
    const { fm } = V.parseNote(text);
    const ids = V.fonteAutomationIds(fm.fonte);
    if (ids.length) porNota.set(r, { ids, hash: fm.fonte_hash, status: fm.status });
  }
  const ids = [...new Set([...porNota.values()].flatMap((x) => x.ids))];
  const db = new PrismaClient();
  let autos = [];
  try {
    autos = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return tx.automation.findMany({ where: { id: { in: ids } }, select: { id: true, isActive: true, actions: true } });
    });
  } finally {
    await db.$disconnect();
  }
  const byId = new Map(autos.map((a) => [a.id, a]));
  for (const [r, n] of porNota) {
    const vivas = n.ids.map((id) => byId.get(id));
    if (vivas.some((a) => !a)) resultado.drift.push({ nota: r, status: n.status, motivo: "automação apagada" });
    else if (vivas.some((a) => !a.isActive)) resultado.drift.push({ nota: r, status: n.status, motivo: "automação desativada" });
    else if (V.sourceHash(vivas) !== n.hash) resultado.drift.push({ nota: r, status: n.status, motivo: "texto da automação mudou" });
  }
}

const nErros = Object.keys(resultado.erros).length;
if (args.json) {
  console.log(JSON.stringify(resultado, null, 2));
} else {
  const porStatus = {};
  for (const t of notas.values()) {
    const s = String(V.parseNote(t).fm.status ?? "?");
    porStatus[s] = (porStatus[s] ?? 0) + 1;
  }
  console.log(`Notas verificadas: ${resultado.verificadas} · ${Object.entries(porStatus).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  for (const [r, errs] of Object.entries(resultado.erros)) {
    console.log(`✗ ${r}`);
    for (const e of errs) console.log(`    - ${e}`);
  }
  if (resultado.links.length) console.log(`✗ Mapa da Operação.md: ${resultado.links.length} wikilink(s) sem arquivo: ${resultado.links.slice(0, 10).join(", ")}`);
  if (args.drift) {
    console.log(`Drift (automação mudou depois da nota): ${resultado.drift.length}`);
    for (const d of resultado.drift) console.log(`  ! ${d.nota} [${d.status}] — ${d.motivo}`);
  }
  if (!nErros && !resultado.links.length) console.log("✓ vault ok");
}
process.exit(nErros || resultado.links.length ? 1 : 0);

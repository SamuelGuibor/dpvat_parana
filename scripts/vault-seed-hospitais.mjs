// Seed determinístico do vault da operação (docs/operacao/) a partir das
// automações do CRM. Só LÊ o banco (transação READ ONLY) e só escreve arquivos
// do repositório. Etapa 2 do AI-First: docs/ai-first/02-plano-etapa-2.md §2.
//
// O que gera:
//   hospitais/<slug>.md           1 por hospital das automações ATIVAS da coluna
//                                 "DISTRIBUIÇÃO DE SOLICITAÇÕES" (inativas ficam fora:
//                                 decisão do dono). Só o esqueleto: frontmatter,
//                                 contatos por regex e o bloco ## Fonte LITERAL.
//                                 Interpretar o texto é trabalho do agente redator.
//   modelos/email-prontuario.md   texto da automação "GERAL" de FAZER PROTOCOLO
//   _relatorios/lacunas.md        cards ativos sem procedimento, GHOST sem automação…
//   _modelo-nota.md               modelo comentado (só se não existir)
//   Mapa da Operação.md           índice com wikilinks (regerado a cada --apply)
//
// Nunca destrói trabalho: nota já redigida/publicada cuja fonte mudou vira
// `desatualizado` (o bloco Fonte e o hash são trocados, as seções redigidas
// ficam e o redator refaz). Regra em decideSeed (app/_shared/utils/vault.ts).
//
// Uso (PRODUÇÃO: o .env aponta para o Neon; só leitura):
//   node -r dotenv/config scripts/vault-seed-hospitais.mjs            # dry-run
//   node -r dotenv/config scripts/vault-seed-hospitais.mjs --apply    # escreve
import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const SCRIPT = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ROOT = join(dirname(SCRIPT), "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const APPLY = Boolean(args.apply);
const VAULT = join(ROOT, typeof args.saida === "string" ? args.saida : "docs/operacao");
const TEAM = ["ADMIN", "ADMIN+", "ADMIN++"];
const COLUNA_HOSPITAIS = "DISTRIBUICAO DE SOLICITACOES";
const COLUNA_PROTOCOLO = "FAZER PROTOCOLO";

const require = createRequire(import.meta.url);
const jitiMod = require("jiti");
const createJiti = jitiMod.createJiti ?? jitiMod.default ?? jitiMod;
const jiti = createJiti(SCRIPT, { interopDefault: true, cache: false });
const V = await (typeof jiti.import === "function"
  ? jiti.import("../app/_shared/utils/vault.ts")
  : jiti("../app/_shared/utils/vault.ts"));

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const agoraBR = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
const dataBR = (d) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(d);

// ------------------------------------------------------------------ leitura
const db = new PrismaClient();
let data;
try {
  data = await db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const labels = await tx.label.findMany({ select: { id: true, name: true } });
      const automations = await tx.automation.findMany({
        select: { id: true, name: true, isActive: true, triggerLabelId: true, conditions: true, actions: true, updatedAt: true },
        orderBy: { createdAt: "asc" },
      });
      const ghosts = await tx.user.findMany({ where: { role: "GHOST" }, select: { id: true, name: true } });
      const cards = await tx.user.findMany({
        where: { role: { notIn: [...TEAM, "GHOST"] }, archiveStatus: null, hospital: { not: null } },
        select: { hospital: true },
      });
      return { labels, automations, ghosts, cards };
    },
    { timeout: 60_000, maxWait: 20_000 },
  );
} finally {
  await db.$disconnect();
}

const labelByNorm = new Map(data.labels.map((l) => [V.normalizeHospitalName(l.name), l]));
const colHosp = labelByNorm.get(COLUNA_HOSPITAIS);
// Nome real: "FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL" — casa pelo começo.
const colProt = [...labelByNorm.entries()].find(([k]) => k.startsWith(COLUNA_PROTOCOLO))?.[1];
if (!colHosp) {
  console.error(`Coluna "${COLUNA_HOSPITAIS}" não encontrada.`);
  process.exit(1);
}

const hospitalOf = (a) => {
  const conds = Array.isArray(a.conditions) ? a.conditions : [];
  const c = conds.find((x) => x?.field === "hospital" && x?.operator === "equals" && String(x.value ?? "").trim());
  return c ? String(c.value).trim() : null;
};

const doColuna = data.automations.filter((a) => a.triggerLabelId === colHosp.id);
const ativas = doColuna.filter((a) => a.isActive);
const semHospital = ativas.filter((a) => !hospitalOf(a));

// Agrupa por nome normalizado (2 nomes repetidos → 1 nota com 2 fontes).
const grupos = new Map();
for (const a of ativas) {
  const h = hospitalOf(a);
  if (!h) continue;
  const k = V.normalizeHospitalName(h);
  const g = grupos.get(k) ?? { nome: h, autos: [] };
  g.autos.push(a);
  grupos.set(k, g);
}

const ghostByNorm = new Map();
for (const g of data.ghosts) {
  const k = V.normalizeHospitalName(g.name ?? "");
  if (k && !ghostByNorm.has(k)) ghostByNorm.set(k, g);
}
const cardsByNorm = new Map();
for (const c of data.cards) {
  const k = V.normalizeHospitalName(c.hospital);
  if (!k) continue;
  const e = cardsByNorm.get(k) ?? { nome: c.hospital.trim(), n: 0 };
  e.n++;
  cardsByNorm.set(k, e);
}

// ------------------------------------------------------------------ notas
const plano = { criar: [], atualizar: [], pular: [], desatualizar: [] };
const writes = new Map(); // caminho absoluto → conteúdo

function fonteBlock(autos) {
  const out = ["## Fonte", "", "Texto LITERAL da automação no CRM (não editar à mão: o seed regrava). É a única base para as seções acima."];
  for (const a of autos) {
    out.push("", `### automation:${a.id} — ${a.name} (atualizada em ${dataBR(a.updatedAt)})`, "", "````text", V.automationSourceText(a) || "(sem texto)", "````");
    const anexos = V.automationAttachments(a);
    if (anexos.length) out.push("", `Anexos (S3 \`automation-templates/\`): ${anexos.map((n) => `\`${n}\``).join(", ")}`);
  }
  return out.join("\n");
}

const PLACEHOLDER = [
  "## Como pedir",
  "",
  "_(a redigir pelo agente redator a partir da Fonte)_",
  "",
  "## Contato",
  "",
  "## Documentos e procuração",
  "",
  "## Prazo e retorno",
  "",
  "## Observações",
  "",
].join("\n");

/** Planeja a escrita de uma nota baseada em automações. */
function planejar(relPath, titulo, autos, extraFm) {
  const abs = join(VAULT, relPath);
  const hash = V.sourceHash(autos);
  const texto = autos.map(V.automationSourceText).join("\n\n");
  const existing = existsSync(abs) ? V.parseNote(readFileSync(abs, "utf8")) : null;
  const decisao = V.decideSeed(existing?.fm ?? null, hash);
  plano[decisao].push(relPath);
  if (decisao === "pular") return;

  const fonte = fonteBlock(autos);
  if (decisao === "desatualizar") {
    // Mantém o que foi redigido; troca só a Fonte, o hash e o status.
    const fm = {
      ...existing.fm,
      status: "desatualizado",
      fonte: autos.map((a) => `automation:${a.id}`).join(", "),
      fonte_hash: hash,
      atualizado_em: hoje,
      pendente_humano: [
        ...(Array.isArray(existing.fm.pendente_humano) ? existing.fm.pendente_humano : []),
        `fonte mudou em ${hoje}: refazer as seções a partir da nova Fonte`,
      ],
    };
    const corpo = existing.body.replace(/^## +Fonte\b[\s\S]*$/m, fonte);
    writes.set(abs, V.renderNote(fm, corpo));
    return;
  }
  const fm = {
    kind: "extraido_do_codigo",
    status: "rascunho",
    fonte: autos.map((a) => `automation:${a.id}`).join(", "),
    fonte_hash: hash,
    ...extraFm,
    modo: null,
    contatos: V.extractContacts(texto),
    procuracao: null,
    prazo: null,
    redigido_por: null,
    validado_por: null,
    publicado_por: null,
    atualizado_em: hoje,
    pendente_humano: texto.replace(/\[anexo\][^\n]*/g, "").trim().length < 15 ? ["automação sem texto útil: a equipe precisa escrever o procedimento"] : [],
  };
  writes.set(abs, V.renderNote(fm, `\n# ${titulo}\n\n${PLACEHOLDER}\n${fonte}\n`));
}

// Slugs únicos (dois nomes diferentes podem cair no mesmo slug).
const usados = new Map();
const ordenados = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]));
for (const [k, g] of ordenados) {
  let slug = V.slugify(g.nome);
  if (usados.has(slug) && usados.get(slug) !== k) {
    let i = 2;
    while (usados.has(`${slug}-${i}`)) i++;
    slug = `${slug}-${i}`;
  }
  usados.set(slug, k);
  const ghost = ghostByNorm.get(k);
  planejar(`hospitais/${slug}.md`, g.nome, g.autos, { hospital: g.nome, ghost_id: ghost?.id ?? null });
}

// Modelo do e-mail de pedido de prontuário (automação "GERAL" de FAZER PROTOCOLO).
const geral = colProt
  ? data.automations.find((a) => a.triggerLabelId === colProt.id && a.isActive && /GERAL/i.test(a.name ?? "")) ??
    data.automations.filter((a) => a.triggerLabelId === colProt.id && a.isActive)[0]
  : null;
if (geral) planejar("modelos/email-prontuario.md", "Modelo — e-mail de pedido de prontuário", [geral], {});
else {
  const parecidas = data.labels.filter((l) => /PROTOCOLO/i.test(l.name)).map((l) => {
    const n = data.automations.filter((a) => a.triggerLabelId === l.id);
    return `"${l.name}" (${n.length} automações, ${n.filter((a) => a.isActive).length} ativas: ${n.map((a) => a.name).join(" / ")})`;
  });
  console.warn(`Aviso: sem automação ativa em "${COLUNA_PROTOCOLO}" para o modelo de e-mail. Colunas parecidas: ${parecidas.join("; ") || "nenhuma"}`);
}

// ------------------------------------------------------------------ lacunas
const semAuto = [...cardsByNorm.entries()].filter(([k]) => !grupos.has(k)).sort((a, b) => b[1].n - a[1].n);
const comAuto = [...cardsByNorm.entries()].filter(([k]) => grupos.has(k));
const totalCards = [...cardsByNorm.values()].reduce((s, e) => s + e.n, 0);
const cardsCobertos = comAuto.reduce((s, [, e]) => s + e.n, 0);
const ghostSemAuto = [...ghostByNorm.entries()].filter(([k]) => !grupos.has(k)).map(([, g]) => g.name);
const autoSemGhost = [...grupos.entries()].filter(([k]) => !ghostByNorm.has(k)).map(([, g]) => g.nome);
const duplicados = [...grupos.values()].filter((g) => g.autos.length > 1);
const inativas = doColuna.filter((a) => !a.isActive);

const L = [];
L.push("---", "kind: extraido_do_codigo", "status: rascunho", "fonte: banco", `atualizado_em: ${hoje}`, "pendente_humano: []", "---", "");
L.push("# Lacunas do vault de hospitais", "");
L.push(`> Gerado em ${agoraBR} por \`scripts/vault-seed-hospitais.mjs\`. Corrigir o cadastro (nome do hospital no card, GHOST, automação) é trabalho humano no CRM.`, "");
L.push("## Resumo", "");
L.push(`- Automações na coluna "${colHosp.name}": ${doColuna.length} (${ativas.length} ativas, ${inativas.length} inativas fora do vault)`);
L.push(`- Hospitais distintos nas ativas: ${grupos.size} · nomes repetidos juntados: ${duplicados.length} · sem condição de hospital: ${semHospital.length}`);
L.push(`- GHOST (catálogo): ${data.ghosts.length} · hospitais das automações que casam com um GHOST: ${grupos.size - autoSemGhost.length}`);
L.push(`- Cards ativos com hospital: ${totalCards} · com procedimento: ${cardsCobertos} (${totalCards ? Math.round((100 * cardsCobertos) / totalCards) : 0}%)`, "");
L.push(`## Cards ativos de hospitais sem procedimento (${semAuto.length})`, "");
L.push("Nome como está no card. Pode ser hospital sem automação **ou** nome digitado diferente do da automação.", "");
L.push("| Hospital (no card) | cards ativos |", "|---|---|");
for (const [, e] of semAuto) L.push(`| ${e.nome.replace(/\|/g, "/")} | ${e.n} |`);
L.push("", `## GHOST sem automação (${ghostSemAuto.length})`, "");
for (const n of ghostSemAuto.sort((a, b) => a.localeCompare(b, "pt-BR"))) L.push(`- ${n}`);
L.push("", `## Automação sem GHOST com o mesmo nome (${autoSemGhost.length})`, "");
for (const n of autoSemGhost.sort((a, b) => a.localeCompare(b, "pt-BR"))) L.push(`- ${n}`);
L.push("", `## Nomes repetidos juntados numa nota (${duplicados.length})`, "");
for (const g of duplicados) L.push(`- ${g.nome}: ${g.autos.map((a) => `automation:${a.id}`).join(", ")}`);
if (semHospital.length) {
  L.push("", `## Automações ativas sem condição "hospital igual a" (${semHospital.length})`, "");
  for (const a of semHospital) L.push(`- automation:${a.id} — ${a.name}`);
}
L.push("");
writes.set(join(VAULT, "_relatorios/lacunas.md"), L.join("\n"));

// ------------------------------------------------------------------ modelo de nota
const modeloPath = join(VAULT, "_modelo-nota.md");
if (!existsSync(modeloPath)) {
  writes.set(
    modeloPath,
    [
      "# Modelo de nota do vault",
      "",
      "Frontmatter: uma linha por campo; listas e objetos em JSON numa linha só (o `scripts/vault-check.mjs` recusa o resto).",
      "",
      "```yaml",
      "kind: oficial | extraido_do_codigo | extraido_dos_logs | sugestao_ia",
      "status: rascunho | em_validacao | publicado | desatualizado",
      'fonte: automation:<id>          # ou "pessoa:<nome>, <data>", "docs/ai/<mapa>.md", "card:<nº>", "ticket:<nº>", "logs:<data>:<dias>d"',
      "fonte_hash: <sha256>            # obrigatório quando a fonte é automação (o seed calcula)",
      "hospital: <nome exato da condição da automação>   # só em hospitais/",
      "ghost_id: <User.id do GHOST>    # ou null",
      'modo: ["email", "whatsapp", "presencial", "site"]',
      'contatos: {"email": [], "telefone": [], "site": []}   # só o que está LITERAL na Fonte',
      "procuracao: <texto curto> | null",
      "prazo: <texto> | null",
      "redigido_por: agente-redator | <pessoa> | null",
      "validado_por: agente-validador | <pessoa> | null",
      "publicado_por: <pessoa com manage_knowledge> | agente-validador | null",
      "atualizado_em: AAAA-MM-DD",
      'pendente_humano: []             # o que só uma pessoa resolve; vazio para publicar',
      "```",
      "",
      "Corpo de nota de hospital: `## Como pedir`, `## Contato`, `## Documentos e procuração`, `## Prazo e retorno`, `## Observações`, `## Fonte` (literal, gerado).",
      "",
    ].join("\n"),
  );
}

// ------------------------------------------------------------------ saída
const rel = (p) => relative(VAULT, p).replace(/\\/g, "/");
console.log(`Vault: ${relative(ROOT, VAULT)}  ${APPLY ? "(--apply: escrevendo)" : "(dry-run: nada escrito; use --apply)"}`);
console.log(`Automações ativas na coluna: ${ativas.length} · hospitais: ${grupos.size} · GHOST: ${data.ghosts.length}`);
console.log(`Cards ativos com hospital: ${totalCards} · cobertos: ${cardsCobertos} · hospitais de card sem procedimento: ${semAuto.length}`);
for (const k of ["criar", "atualizar", "desatualizar", "pular"]) {
  console.log(`  ${k.padEnd(12)} ${plano[k].length}`);
  if (k !== "pular" && k !== "criar") for (const p of plano[k]) console.log(`    - ${p}`);
}

if (APPLY) {
  for (const [abs, text] of writes) {
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, text.endsWith("\n") ? text : `${text}\n`);
  }
  // Índice a partir do que está no disco (inclui etapas/serviços de outros scripts).
  const entries = [];
  const walk = (dir) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else if (d.name.endsWith(".md") && !d.name.startsWith("_modelo") && d.name !== "Mapa da Operação.md") {
        const r = rel(p);
        if (!r.includes("/")) continue;
        const t = readFileSync(p, "utf8");
        entries.push({ path: r, title: V.noteTitle(r, t), status: String(V.parseNote(t).fm.status ?? "") });
      }
    }
  };
  walk(VAULT);
  writeFileSync(join(VAULT, "Mapa da Operação.md"), V.renderIndex(entries, agoraBR));
  console.log(`Escritos: ${writes.size} arquivo(s) + Mapa da Operação.md (${entries.length} notas no índice).`);
}

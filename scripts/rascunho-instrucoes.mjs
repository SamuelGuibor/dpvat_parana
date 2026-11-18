// Cria o RASCUNHO da próxima versão das instruções do bot (aba Instruções) a
// partir da versão PUBLICADA + os blocos marcados num documento de plano
// (ex.: docs/planos/2026-11-18-instrucoes-v33-aceite-depois-documento.md).
// Nunca publica: quem publica é o dono, pela aba, depois de conferir.
//
// Marcadores no .md (cada um seguido de blocos ```text):
//   <!-- v33:trocar secao=5 -->      2 blocos: trecho atual (precisa aparecer 1 vez) e o novo
//   <!-- v33:acrescentar secao=6 --> 1 bloco: vai ao fim da seção, num parágrafo novo
//   <!-- v33:substituir secao=7 -->  1 bloco: conteúdo inteiro novo da seção
// `secao` = nº de ordem da seção na versão publicada (o diag-instrucoes-bot.mjs lista).
// O "v33" do marcador precisa ser a versão publicada + 1: o plano foi escrito
// sobre ela; se outra versão foi publicada no meio, o script recusa.
//
// Uso (PRODUÇÃO: o banco local é o Neon de produção):
//   node -r dotenv/config scripts/rascunho-instrucoes.mjs <plano.md>           (dry-run)
//   node -r dotenv/config scripts/rascunho-instrucoes.mjs <plano.md> --apply   (grava o rascunho)
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");
if (!file) throw new Error("Passe o caminho do plano (.md).");
const md = readFileSync(file, "utf8").replace(/\r\n/g, "\n");

// ─── Blocos do plano ─────────────────────────────────────────────────────────
const MARK = /<!-- v(\d+):(trocar|acrescentar|substituir) secao=(\d+) -->/g;
const FENCE_OPEN = "```text\n";
const FENCE_CLOSE = "\n```";
function blocksAfter(from, n) {
  const out = [];
  let pos = from;
  for (let i = 0; i < n; i++) {
    const start = md.indexOf(FENCE_OPEN, pos);
    if (start < 0) throw new Error(`Bloco \`\`\`text ${i + 1} não encontrado depois da posição ${from}`);
    const end = md.indexOf(FENCE_CLOSE, start + FENCE_OPEN.length);
    if (end < 0) throw new Error("Bloco ```text sem fechamento");
    out.push(md.slice(start + FENCE_OPEN.length, end));
    pos = end + FENCE_CLOSE.length;
  }
  return out;
}
const ops = [];
for (const m of md.matchAll(MARK)) {
  const [, version, kind, order] = m;
  const blocks = blocksAfter(m.index + m[0].length, kind === "trocar" ? 2 : 1);
  ops.push({ version: Number(version), kind, order: Number(order), blocks });
}
if (!ops.length) throw new Error("Nenhum marcador <!-- vN:… secao=N --> no plano.");
const target = ops[0].version;
if (ops.some((o) => o.version !== target)) throw new Error("Marcadores com versões diferentes no mesmo plano.");

// ─── Mesmo texto que o bot recebe (renderInstructions em lib/whatsapp/instructions.ts) ──
const RULE = "═".repeat(39);
const render = (intro, sections) =>
  `${intro}\n\n${[...sections].filter((s) => s.enabled).sort((a, b) => a.order - b.order)
    .map((s) => `${RULE}\n${s.title}\n${RULE}\n\n${s.content}`).join("\n\n")}\n`;

const db = new PrismaClient();
try {
  const [published, draft, last] = await Promise.all([
    db.whatsAppInstructions.findFirst({ where: { status: "publicado" }, orderBy: { version: "desc" } }),
    db.whatsAppInstructions.findFirst({ where: { status: "rascunho" }, orderBy: { version: "desc" }, select: { version: true } }),
    db.whatsAppInstructions.findFirst({ orderBy: { version: "desc" }, select: { version: true } }),
  ]);
  if (!published) throw new Error("Não há versão publicada.");
  if (draft) throw new Error(`Já existe o rascunho v${draft.version} na aba Instruções: publique ou descarte antes.`);
  if (published.version + 1 !== target || (last?.version ?? 0) + 1 !== target) {
    throw new Error(`O plano é da v${target}, mas a publicada é a v${published.version} (última versão: v${last?.version}).`);
  }

  const sections = structuredClone(published.sections ?? []).sort((a, b) => a.order - b.order);
  for (const op of ops) {
    const s = sections.find((x) => x.order === op.order);
    if (!s) throw new Error(`Seção ${op.order} não existe na v${published.version}.`);
    const before = s.content.length;
    if (op.kind === "trocar") {
      const [antes, depois] = op.blocks;
      const hits = s.content.split(antes).length - 1;
      if (hits !== 1) throw new Error(`Seção ${op.order} (${s.title}): o trecho a trocar aparece ${hits} vez(es), precisa ser 1.`);
      s.content = s.content.replace(antes, () => depois);
    } else if (op.kind === "acrescentar") {
      if (s.content.includes(op.blocks[0])) throw new Error(`Seção ${op.order}: o trecho a acrescentar já está lá.`);
      s.content = `${s.content.trimEnd()}\n\n${op.blocks[0]}`;
    } else {
      s.content = op.blocks[0];
    }
    console.log(`  ${op.kind.padEnd(11)} seção ${op.order}. ${s.title} — ${before} → ${s.content.length} chars`);
  }

  const charCount = render(published.intro, sections).length;
  console.log(`\nv${published.version} publicada: ${published.charCount} chars → rascunho v${target}: ${charCount} chars`);
  if (!apply) {
    console.log("[dry-run] nada gravado. Rode com --apply para criar o rascunho.");
  } else {
    const row = await db.whatsAppInstructions.create({
      data: { version: target, intro: published.intro, sections, status: "rascunho", charCount },
      select: { id: true, version: true },
    });
    console.log(`Rascunho v${row.version} criado (${row.id}). Confira e publique pela aba Instruções.`);
  }
} finally {
  await db.$disconnect();
}

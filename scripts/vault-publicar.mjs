// Passos determinísticos da publicação do vault (docs/operacao/), usados pela
// skill /publicar-conhecimento. Agentes redigem/julgam; quem muda status é
// este script — assim nenhuma nota vira `publicado` sem passar no checkNote.
// Não lê banco. Etapa 2 do AI-First (docs/ai-first/02-plano-etapa-2.md §3).
//
//   node scripts/vault-publicar.mjs proximos [--n=20] [--pasta=hospitais]
//       → JSON com as próximas notas para o redator (desatualizado primeiro,
//         depois rascunho sem redator; ignora as que têm pendente_humano)
//   node scripts/vault-publicar.mjs marcar --nota=<rel> --status=em_validacao [--por=agente-redator]
//   node scripts/vault-publicar.mjs marcar --nota=<rel> --status=publicado [--por=agente-validador]
//   node scripts/vault-publicar.mjs marcar --nota=<rel> --status=rascunho --pendente="motivo"
//   node scripts/vault-publicar.mjs relatorio --lote=<id> --aprovadas=a,b --devolvidas=c --pendentes=d
//       → _relatorios/publicacao-<data>-<lote>.md com amostra de 10% para o dono conferir
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const SCRIPT = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ROOT = join(dirname(SCRIPT), "..");
const VAULT = join(ROOT, "docs/operacao");
const [cmd, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(
  rest.map((a) => {
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

const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const relOf = (r) => String(r).trim().replace(/\\/g, "/").replace(/^docs\/operacao\//, "");
const lista = (v) => (typeof v === "string" ? v.split(",").map(relOf).filter(Boolean) : []);
const fail = (msg) => {
  console.error(msg);
  process.exit(1);
};

if (cmd === "proximos") {
  const pasta = typeof args.pasta === "string" ? args.pasta : "hospitais";
  const n = Math.max(1, Number(args.n ?? 20));
  const dir = join(VAULT, pasta);
  if (!existsSync(dir)) fail(`Pasta ${pasta} não existe no vault.`);
  const notas = readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => {
      const r = `${pasta}/${f}`;
      const { fm } = V.parseNote(readFileSync(join(VAULT, r), "utf8"));
      return { nota: r, status: fm.status, redigido: Boolean(fm.redigido_por), pendente: Array.isArray(fm.pendente_humano) ? fm.pendente_humano : [] };
    });
  const desat = notas.filter((x) => x.status === "desatualizado");
  const novas = notas.filter((x) => x.status === "rascunho" && !x.redigido && !x.pendente.length);
  const fila = [...desat, ...novas];
  const contagem = {};
  for (const x of notas) contagem[x.status] = (contagem[x.status] ?? 0) + 1;
  console.log(
    JSON.stringify(
      {
        lote: fila.slice(0, n).map((x) => x.nota),
        restantes: Math.max(0, fila.length - n),
        presas_em_pendente_humano: notas.filter((x) => x.status === "rascunho" && x.pendente.length).map((x) => x.nota),
        contagem,
      },
      null,
      2,
    ),
  );
} else if (cmd === "marcar") {
  const r = relOf(args.nota ?? "");
  const abs = join(VAULT, r);
  if (!r || r.includes("..") || !existsSync(abs)) fail(`Nota não encontrada: ${r}`);
  const status = String(args.status ?? "");
  const { fm, body, errors } = V.parseNote(readFileSync(abs, "utf8"));
  if (errors.length) fail(`Frontmatter inválido em ${r}: ${errors.join("; ")}`);
  const next = { ...fm, status, atualizado_em: hoje };
  if (status === "em_validacao") {
    next.redigido_por = typeof args.por === "string" ? args.por : "agente-redator";
    next.validado_por = null;
    next.publicado_por = null;
  } else if (status === "publicado") {
    if (fm.status !== "em_validacao") fail(`${r}: só publica nota em_validacao (está ${fm.status}).`);
    const por = typeof args.por === "string" ? args.por : "agente-validador";
    next.validado_por = por;
    next.publicado_por = por;
  } else if (status === "rascunho") {
    const motivo = typeof args.pendente === "string" ? args.pendente.trim() : "";
    if (!motivo) fail("rascunho exige --pendente=\"motivo\" (o que só uma pessoa resolve).");
    next.pendente_humano = [...(Array.isArray(fm.pendente_humano) ? fm.pendente_humano : []), motivo];
    next.validado_por = null;
    next.publicado_por = null;
  } else {
    fail("status deve ser em_validacao | publicado | rascunho");
  }
  const text = V.renderNote(next, body);
  const errs = V.checkNote(r, text);
  if (errs.length) fail(`${r} não passa no vault-check, nada gravado:\n  - ${errs.join("\n  - ")}`);
  writeFileSync(abs, text);
  console.log(`${r} → ${status}`);
} else if (cmd === "relatorio") {
  const lote = typeof args.lote === "string" ? args.lote : hoje;
  const aprovadas = lista(args.aprovadas);
  const devolvidas = lista(args.devolvidas);
  const pendentes = lista(args.pendentes);
  const amostra = V.sampleOf(aprovadas, 0.1, lote);
  const pend = (r) => {
    const abs = join(VAULT, r);
    if (!existsSync(abs)) return [];
    const p = V.parseNote(readFileSync(abs, "utf8")).fm.pendente_humano;
    return Array.isArray(p) ? p : [];
  };
  const link = (r) => `[[${r.replace(/\.md$/, "")}]]`;
  const L = [
    "---",
    "kind: extraido_do_codigo",
    "status: rascunho",
    `fonte: lote:${lote}`,
    `atualizado_em: ${hoje}`,
    "pendente_humano: []",
    "---",
    "",
    `# Publicação do vault — lote ${lote}`,
    "",
    `> ${aprovadas.length} aprovadas pelo agente validador · ${devolvidas.length} devolvidas (2ª reprovação → rascunho) · ${pendentes.length} com pendência humana.`,
    "",
    `## Amostra para o dono conferir (${amostra.length} de ${aprovadas.length}, 10%)`,
    "",
    "Abra cada nota e compare as seções com o bloco **Fonte**. Se alguma estiver errada, avise: a nota volta para rascunho e o lote é revisto.",
    "",
    ...amostra.map((r) => `- [ ] ${link(r)}`),
    "",
    "## Aprovadas",
    "",
    ...(aprovadas.length ? aprovadas.map((r) => `- ${link(r)}`) : ["—"]),
    "",
    "## Devolvidas duas vezes (ficaram rascunho)",
    "",
    ...(devolvidas.length ? devolvidas.map((r) => `- ${link(r)} — ${pend(r).join("; ") || "ver nota"}`) : ["—"]),
    "",
    "## Pendente humano",
    "",
    ...(pendentes.length ? pendentes.map((r) => `- ${link(r)} — ${pend(r).join("; ")}`) : ["—"]),
    "",
  ];
  const loteId = lote.replace(/[^\w-]+/g, "-").slice(0, 60);
  const out = join(VAULT, "_relatorios", `publicacao-${hoje}-${loteId}.md`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, L.join("\n"));
  // Lote em JSON para a tela "Conferência da amostra" do Cérebro APP (sobe pelo
  // sync-vault-s3 em operacao-vault/_lotes/): fonte literal × seções redigidas.
  const amostraJson = amostra.map((r) => {
    const text = readFileSync(join(VAULT, r), "utf8");
    const { fm, body } = V.parseNote(text);
    const secs = V.sections(body);
    const fonte = (secs.Fonte ?? "").match(/````text\n([\s\S]*?)\n````/g)?.map((b) => b.replace(/^````text\n|\n````$/g, "")).join("\n\n") ?? "";
    const automacao = (secs.Fonte ?? "").match(/^### automation:\S+ — (.+?) \(atualizada/m)?.[1] ?? null;
    const secoes = Object.fromEntries(Object.entries(secs).filter(([k]) => k !== "Fonte"));
    return {
      nota: r,
      titulo: V.noteTitle(r, text),
      hospital: typeof fm.hospital === "string" ? fm.hospital : null,
      automacao,
      fonte,
      secoes,
      contatos: fm.contatos ?? { email: [], telefone: [], site: [] },
      modo: Array.isArray(fm.modo) ? fm.modo : null,
      procuracao: typeof fm.procuracao === "string" ? fm.procuracao : null,
    };
  });
  const loteJson = join(VAULT, "_lotes", `${loteId}.json`);
  mkdirSync(dirname(loteJson), { recursive: true });
  writeFileSync(
    loteJson,
    JSON.stringify({ id: loteId, data: hoje, aprovadas, devolvidas, pendentes, amostra: amostraJson }, null, 2) + "\n",
  );
  console.log(`Lote (JSON): ${relative(ROOT, loteJson).replace(/\\/g, "/")}`);
  console.log(`Relatório: ${relative(ROOT, out).replace(/\\/g, "/")}`);
  console.log(`Amostra: ${amostra.join(", ") || "—"}`);
} else {
  fail("Uso: vault-publicar.mjs proximos | marcar | relatorio (ver cabeçalho do arquivo)");
}

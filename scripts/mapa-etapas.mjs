// Mapa do que cada coluna do kanban RECEBE e do que o card TEM quando sai,
// a partir da tabela logs (move, document_add, update, status_change,
// comment_add, ai_audit, archive) + Document/CardTag de hoje. Só leitura.
//
// Para que serve: não existe lista oficial "o que precisa em cada etapa"
// (Etapa 2 do AI-First, docs/ai-first/02-plano-etapa-2.md). Este mapa é a
// evidência do que a equipe de fato faz em cada coluna; vira o rascunho das
// notas etapas/<coluna>.md do vault, que uma pessoa confirma.
//
// Uso (PRODUÇÃO: o .env aponta para o Neon):
//   node -r dotenv/config scripts/mapa-etapas.mjs [--dias=90] [--out=<arquivo.md>]
//   node -r dotenv/config scripts/mapa-etapas.mjs --vault [--apply]
// Sem --out imprime no terminal. --vault gera (dry-run sem --apply) as notas
// docs/operacao/etapas/<coluna>.md e servicos/inss.md como RASCUNHO, com as
// propostas "para entrar/para sair" e as perguntas sim/não para o dono; nota
// já redigida, confirmada ou publicada não é reescrita. A saída só tem números agregados por coluna
// (nenhum nome, CPF ou telefone de cliente).
//
// Como uma "passagem" é contada: o card entra na coluna C por um log `move`
// (to = C) dentro da janela; a passagem termina no próximo `move` do mesmo card
// (saída) ou fica "em andamento". Eventos entre a entrada e a saída contam para
// a passagem. "Na saída" = arquivos que o card tinha no instante da saída
// (Document criado antes e não apagado até lá). Tags não têm log: só a foto de hoje.
import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SCRIPT = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const DIAS = Math.max(7, Number(args.dias ?? 90));
const desde = new Date(Date.now() - DIAS * 86_400_000);
const DAY = 86_400_000;
const TEAM = ["ADMIN", "ADMIN+", "ADMIN++", "GHOST"];

// Pastas: mesma regra do CRM (inferCategory), carregada do .ts via jiti.
const require = createRequire(import.meta.url);
let jitiMod;
try {
  jitiMod = require("jiti");
} catch {
  console.error("Não achei o pacote jiti no node_modules (rode npm install).");
  process.exit(1);
}
const createJiti = jitiMod.createJiti ?? jitiMod.default ?? jitiMod;
const jiti = createJiti(SCRIPT, { interopDefault: true, cache: false });
const cats = await (typeof jiti.import === "function"
  ? jiti.import("../app/_shared/lib/document-categories.ts")
  : jiti("../app/_shared/lib/document-categories.ts"));
const { DOCUMENT_CATEGORIES, inferCategory, isDocumentCategory } = cats;
const folderOf = (d) => (d.category && isDocumentCategory(d.category) ? d.category : inferCategory(d.name));

const pct = (n, d) => (d ? Math.round((100 * n) / d) : 0);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const top = (counter, n = 5) =>
  Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
const moveTarget = (l) => {
  const m = l.metadata ?? {};
  if (typeof m.to === "string") return { from: typeof m.from === "string" ? m.from : null, to: m.to };
  const mm = l.message.match(/moveu (?:de "(.+?)" )?para "(.+?)"/);
  return mm ? { from: mm[1] ?? null, to: mm[2] } : null;
};

const db = new PrismaClient();
let data;
try {
  data = await db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const labels = await tx.label.findMany({ orderBy: { order: "asc" }, select: { id: true, name: true, order: true, timeLimitDays: true } });
      // Cards que se moveram na janela (só User: Process está vazia em produção).
      const movedIds = (
        await tx.log.findMany({
          where: { action: "move", createdAt: { gte: desde }, userId: { not: null } },
          select: { userId: true },
          distinct: ["userId"],
        })
      ).map((r) => r.userId);
      const cards = await tx.user.findMany({
        where: { id: { in: movedIds }, role: { notIn: TEAM } },
        select: { id: true, labelId: true, archiveStatus: true, service: true },
      });
      const ids = cards.map((c) => c.id);
      // Todos os moves desses cards (vida inteira: logs de move nunca são purgados)
      // para saber em que coluna o card estava em cada instante.
      const logs = await tx.log.findMany({
        where: {
          userId: { in: ids },
          OR: [
            { action: "move" },
            {
              action: { in: ["document_add", "update", "status_change", "comment_add", "ai_audit", "archive"] },
              createdAt: { gte: desde },
            },
          ],
        },
        orderBy: { createdAt: "asc" },
        select: { userId: true, action: true, message: true, metadata: true, createdAt: true },
      });
      const docs = await tx.document.findMany({
        where: { userId: { in: ids } },
        select: { userId: true, name: true, category: true, createdAt: true, uploadedAt: true, deletedAt: true },
      });
      const active = await tx.user.findMany({
        where: { role: { notIn: TEAM }, archiveStatus: null },
        select: { labelId: true, cardTags: { select: { name: true } } },
      });
      const automations = await tx.automation.findMany({
        where: { isActive: true },
        select: { name: true, triggerLabelId: true, actions: true },
      });
      return { labels, cards, logs, docs, active, automations };
    },
    { timeout: 120_000, maxWait: 20_000 },
  );
} finally {
  await db.$disconnect();
}

const { labels, cards, logs, docs, active, automations } = data;
const orderByName = new Map(labels.map((l) => [l.name, l.order]));
const norm = (s) => (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
const labelByNorm = new Map(labels.map((l) => [norm(l.name), l.name]));
const canon = (name) => labelByNorm.get(norm(name)) ?? name;

// ---------- passagens por card ----------
const byCard = new Map();
for (const l of logs) {
  const arr = byCard.get(l.userId) ?? [];
  arr.push(l);
  byCard.set(l.userId, arr);
}
const docsByCard = new Map();
for (const d of docs) {
  const arr = docsByCard.get(d.userId) ?? [];
  arr.push(d);
  docsByCard.set(d.userId, arr);
}

const stats = new Map(); // coluna → acumuladores
const S = (col) => {
  if (!stats.has(col)) {
    stats.set(col, {
      entradas: 0,
      saidas: 0,
      emAndamento: 0,
      dias: [],
      voltou: 0,
      de: {},
      para: {},
      arquivados: {},
      comDoc: {},
      docQualquer: 0,
      campos: {},
      comUpdate: 0,
      etapas: {},
      comStatus: 0,
      comentarios: 0,
      comAuditoria: 0,
      naSaida: {},
    });
  }
  return stats.get(col);
};

const now = Date.now();
for (const [cardId, events] of byCard) {
  const moves = events.filter((e) => e.action === "move").map((e) => ({ t: e.createdAt.getTime(), ...moveTarget(e) })).filter((m) => m.to);
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    if (m.t < desde.getTime()) continue;
    const col = canon(m.to);
    const st = S(col);
    st.entradas++;
    if (m.from) st.de[canon(m.from)] = (st.de[canon(m.from)] ?? 0) + 1;
    const next = moves[i + 1];
    const end = next ? next.t : now;
    const inStay = events.filter((e) => e.action !== "move" && e.createdAt.getTime() > m.t && e.createdAt.getTime() <= end);

    const folders = new Set();
    for (const e of inStay) {
      if (e.action === "document_add") {
        const names = Array.isArray(e.metadata?.documents) ? e.metadata.documents : [];
        for (const n of names) folders.add(folderOf({ name: String(n) }));
      }
    }
    // Documento anexado direto (sem passar pela rota que loga) também conta: usa a data do Document.
    for (const d of docsByCard.get(cardId) ?? []) {
      const t = (d.createdAt ?? d.uploadedAt).getTime();
      if (t > m.t && t <= end) folders.add(folderOf(d));
    }
    if (folders.size) st.docQualquer++;
    for (const f of folders) st.comDoc[f] = (st.comDoc[f] ?? 0) + 1;

    const fields = new Set();
    for (const e of inStay.filter((x) => x.action === "update")) {
      for (const f of Array.isArray(e.metadata?.fields) ? e.metadata.fields : []) fields.add(String(f));
    }
    if (fields.size) st.comUpdate++;
    for (const f of fields) st.campos[f] = (st.campos[f] ?? 0) + 1;

    const statusChanges = inStay.filter((x) => x.action === "status_change");
    if (statusChanges.length) st.comStatus++;
    for (const e of statusChanges) {
      const to = e.metadata?.toLabel ?? e.metadata?.to;
      if (to) st.etapas[String(to)] = (st.etapas[String(to)] ?? 0) + 1;
    }
    st.comentarios += inStay.filter((x) => x.action === "comment_add").length;
    if (inStay.some((x) => x.action === "ai_audit")) st.comAuditoria++;
    for (const e of inStay.filter((x) => x.action === "archive" && x.metadata?.archiveStatus)) {
      const k = e.metadata.archiveLabel ?? e.metadata.archiveStatus;
      st.arquivados[k] = (st.arquivados[k] ?? 0) + 1;
    }

    if (next) {
      st.saidas++;
      st.dias.push((next.t - m.t) / DAY);
      const dest = canon(next.to);
      st.para[dest] = (st.para[dest] ?? 0) + 1;
      // Coluna antiga (renomeada/apagada) não tem ordem: não conta como "voltou".
      if (orderByName.has(dest) && orderByName.has(col) && orderByName.get(dest) < orderByName.get(col)) st.voltou++;
      // O que o card TINHA na saída.
      const had = new Set();
      for (const d of docsByCard.get(cardId) ?? []) {
        const c = (d.createdAt ?? d.uploadedAt).getTime();
        const gone = d.deletedAt ? d.deletedAt.getTime() : Infinity;
        if (c <= next.t && gone > next.t) had.add(folderOf(d));
      }
      for (const f of had) st.naSaida[f] = (st.naSaida[f] ?? 0) + 1;
    } else {
      st.emAndamento++;
    }
  }
}

// Foto de hoje: tags dos cards ativos por coluna.
const labelNameById = new Map(labels.map((l) => [l.id, l.name]));
const today = new Map();
for (const a of active) {
  const col = labelNameById.get(a.labelId) ?? "(sem coluna)";
  const t = today.get(col) ?? { n: 0, tags: {} };
  t.n++;
  for (const tg of a.cardTags) t.tags[tg.name] = (t.tags[tg.name] ?? 0) + 1;
  today.set(col, t);
}

// ---------- saída ----------
const folderLabel = new Map(DOCUMENT_CATEGORIES.map((c) => [c.id, c.label]));
const out = [];
const p = (s = "") => out.push(s);
const fmtTop = (counter, total, n = 4) =>
  top(counter, n)
    .map(([k, v]) => `${k} (${pct(v, total)}%)`)
    .join(" · ") || "—";

p(`# Mapa das etapas do kanban pelos logs — últimos ${DIAS} dias`);
p();
p(`> Gerado por \`scripts/mapa-etapas.mjs\` em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Só números agregados.`);
p(`> ${cards.length} cards com movimento na janela · ${logs.length} logs lidos · passagem = entrada na coluna por \`move\` até o próximo \`move\`.`);
p(`> **Isto é o que a equipe FEZ, não a regra oficial.** Serve de rascunho para as notas \`etapas/<coluna>.md\`; uma pessoa confirma.`);
p();
p("## Resumo do fluxo");
p();
p("| # | Coluna | entradas | saídas | em andamento | dias até sair (mediana) | prazo da coluna | voltou para trás | vem de (top) | vai para (top) |");
p("|---|---|---|---|---|---|---|---|---|---|");
for (const l of labels) {
  const st = stats.get(l.name);
  if (!st) {
    p(`| ${l.order} | ${l.name} | 0 | 0 | 0 | — | ${l.timeLimitDays ?? "—"} | — | — | — |`);
    continue;
  }
  const md = median(st.dias);
  p(
    `| ${l.order} | ${l.name} | ${st.entradas} | ${st.saidas} | ${st.emAndamento} | ${md === null ? "—" : md.toFixed(1)} | ${l.timeLimitDays ?? "—"} | ${pct(st.voltou, st.saidas)}% | ${fmtTop(st.de, st.entradas, 2)} | ${fmtTop(st.para, st.saidas, 2)} |`,
  );
}
p();
p("Nomes que não estão na lista de colunas de hoje (ex.: \"REVISÃO PRÉ-PASTA | CAIQUE\", \"ENVIAR  EMAIL UNI\") são colunas antigas, renomeadas ou apagadas: aparecem em \"vem de/vai para\" mas não contam como \"voltou\". A coluna 0 recebe quase todos os cards por criação (log `create`), não por `move`, então tem poucas entradas aqui.");
p();
p("## O que o card já tem ao sair de cada coluna (% das saídas com ≥ 1 arquivo na pasta)");
p();
p(`| Coluna | saídas | ${DOCUMENT_CATEGORIES.map((c) => c.label).join(" | ")} |`);
p(`|---|---|${DOCUMENT_CATEGORIES.map(() => "---").join("|")}|`);
for (const l of labels) {
  const st = stats.get(l.name);
  if (!st?.saidas) continue;
  p(
    `| ${l.name} | ${st.saidas} | ${DOCUMENT_CATEGORIES.map((c) => {
      const v = pct(st.naSaida[c.id] ?? 0, st.saidas);
      return v >= 70 ? `**${v}**` : String(v);
    }).join(" | ")} |`,
  );
}
p();
p("Em negrito: ≥ 70% — forte candidato a \"precisa ter para sair\". A coluna em que uma pasta passa de fraca para negrito é onde a equipe costuma completá-la.");
p();
p("## Por coluna");
for (const l of labels) {
  const st = stats.get(l.name);
  const td = today.get(l.name);
  p();
  p(`### ${l.order}. ${l.name}`);
  if (!st || !st.entradas) {
    p(`Sem entradas por \`move\` na janela. Hoje: ${td?.n ?? 0} card(s).`);
    continue;
  }
  const md = median(st.dias);
  p(`- **Passagens**: ${st.entradas} entradas · ${st.saidas} saídas · ${st.emAndamento} em andamento · mediana até sair: ${md === null ? "—" : `${md.toFixed(1)} dia(s)`}${l.timeLimitDays ? ` (prazo da coluna: ${l.timeLimitDays})` : ""}.`);
  p(`- **Vem de**: ${fmtTop(st.de, st.entradas)}`);
  p(`- **Vai para**: ${fmtTop(st.para, st.saidas)}${st.voltou ? ` · ${pct(st.voltou, st.saidas)}% voltaram para uma coluna anterior` : ""}`);
  if (Object.keys(st.arquivados).length) p(`- **Arquivados a partir daqui**: ${fmtTop(st.arquivados, st.entradas)}`);
  p(`- **Recebeu durante a etapa**:`);
  p(`  - arquivos: ${pct(st.docQualquer, st.entradas)}% das passagens; por pasta: ${top(st.comDoc, 8).map(([k, v]) => `${folderLabel.get(k) ?? k} ${pct(v, st.entradas)}%`).join(" · ") || "—"}`);
  p(`  - campos do cadastro editados: ${pct(st.comUpdate, st.entradas)}% das passagens; mais editados: ${top(st.campos, 6).map(([k, v]) => `${k} ${pct(v, st.entradas)}%`).join(" · ") || "—"}`);
  p(`  - etapa do checklist mudou: ${pct(st.comStatus, st.entradas)}%${Object.keys(st.etapas).length ? ` → ${top(st.etapas, 3).map(([k, v]) => `${k} (${v})`).join(" · ")}` : ""}`);
  p(`  - comentários: ${(st.comentarios / st.entradas).toFixed(1)} por passagem · auditoria IA: ${pct(st.comAuditoria, st.entradas)}%`);
  if (st.saidas) {
    p(`- **O card tinha ao sair** (${st.saidas} saídas): ${DOCUMENT_CATEGORIES.map((c) => `${c.label} ${pct(st.naSaida[c.id] ?? 0, st.saidas)}%`).join(" · ")}`);
    const fortes = DOCUMENT_CATEGORIES.filter((c) => pct(st.naSaida[c.id] ?? 0, st.saidas) >= 70).map((c) => c.label);
    const campos = top(st.campos, 6).filter(([, v]) => pct(v, st.entradas) >= 30).map(([k]) => k);
    p(`- **Sinal de "pronto para sair"** (≥70% na saída / campo editado em ≥30%): ${[...fortes.map((f) => `pasta ${f}`), ...campos.map((c) => `campo ${c}`)].join(", ") || "nenhum padrão forte"}`);
  }
  if (td) p(`- **Hoje**: ${td.n} card(s); tags mais comuns: ${fmtTop(td.tags, td.n, 5)}`);
}

const text = out.join("\n") + "\n";
if (args.vault) {
  await gerarVault();
} else if (args.out) {
  writeFileSync(args.out, text);
  console.log(`Mapa gravado em ${args.out}`);
} else {
  console.log(text);
}

// ---------- vault: etapas/<coluna>.md + servicos/inss.md ----------
async function gerarVault() {
  const V = await (typeof jiti.import === "function"
    ? jiti.import("../app/_shared/utils/vault.ts")
    : jiti("../app/_shared/utils/vault.ts"));
  const VAULT = join(dirname(SCRIPT), "..", "docs/operacao");
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const fonte = `logs:${hoje}:${DIAS}d`;
  const FORTE = 70;
  const writes = [];
  const pulei = [];

  // Só reescreve rascunho que ninguém redigiu/confirmou.
  const podeEscrever = (abs) => {
    if (!existsSync(abs)) return true;
    const { fm } = V.parseNote(readFileSync(abs, "utf8"));
    return fm.status === "rascunho" && !fm.redigido_por && fm.kind === "extraido_dos_logs";
  };
  const fortesNaSaida = (st) =>
    st?.saidas ? DOCUMENT_CATEGORIES.map((c) => ({ c, v: pct(st.naSaida[c.id] ?? 0, st.saidas) })).filter((x) => x.v >= FORTE) : [];
  const autosDaColuna = (labelId) =>
    automations
      .filter((a) => a.triggerLabelId === labelId)
      .map((a) => {
        const tipos = [...new Set((Array.isArray(a.actions) ? a.actions : []).map((x) => x?.type).filter(Boolean))];
        return `${a.name} (${tipos.join(", ") || "sem ação"})`;
      });
  const linkCol = (l) => `[[etapas/${V.slugify(l.name)}|${l.order}. ${l.name}]]`;

  for (const l of labels) {
    const st = stats.get(l.name);
    const td = today.get(l.name);
    const rel = `etapas/${V.slugify(l.name)}.md`;
    const abs = join(VAULT, rel);
    if (!podeEscrever(abs)) {
      pulei.push(rel);
      continue;
    }
    const md = st ? median(st.dias) : null;
    const fortes = fortesNaSaida(st);
    const campos = st ? top(st.campos, 6).filter(([, v]) => pct(v, st.entradas) >= 30) : [];
    // "Para entrar": o que a coluna de onde o card mais vem já entrega na saída.
    const origem = st ? top(st.de, 1)[0]?.[0] : null;
    const fortesOrigem = origem ? fortesNaSaida(stats.get(origem)) : [];
    const autos = autosDaColuna(l.id);
    const perguntas = [
      ...fortes.map((x) => `Para sair de ${l.name}, o card precisa ter **${x.c.label}**? (${x.v}% das saídas já tinham)`),
      ...campos.map(([k, v]) => `Nesta coluna a equipe preenche/confere o campo **${k}**? (editado em ${pct(v, st.entradas)}% das passagens)`),
    ];
    const B = [];
    B.push(`# ${l.order}. ${l.name}`, "");
    B.push(`> Rascunho **extraído dos logs** (${DIAS} dias até ${hoje}, \`scripts/mapa-etapas.mjs --vault\`). Mostra o que a equipe FEZ, não a regra. Vira regra quando o dono responder as perguntas e a nota for publicada.`, "");
    B.push("## Resumo", "");
    B.push(`- Prazo da coluna: ${l.timeLimitDays ? `${l.timeLimitDays} dia(s)` : "sem prazo"}${md === null ? "" : ` · mediana até sair: ${md.toFixed(1)} dia(s)`}`);
    if (st?.entradas) {
      B.push(`- Passagens: ${st.entradas} entradas · ${st.saidas} saídas · ${st.emAndamento} em andamento`);
      B.push(`- Vem de: ${fmtTop(st.de, st.entradas)}`);
      B.push(`- Vai para: ${fmtTop(st.para, st.saidas)}${st.voltou ? ` · ${pct(st.voltou, st.saidas)}% voltaram para trás` : ""}`);
    } else {
      B.push("- Sem entradas por `move` na janela (a coluna 0 recebe cards por criação).");
    }
    B.push("", "## Para entrar (proposta)", "");
    if (fortesOrigem.length) for (const x of fortesOrigem) B.push(`- Chega com **${x.c.label}** (${x.v}% das saídas de ${origem}, de onde o card mais vem)`);
    else B.push("- Sem padrão forte nos logs.");
    B.push("", "## Para sair (proposta)", "");
    for (const x of fortes) B.push(`- Em ${x.v}% das saídas o card já tinha **${x.c.label}**`);
    for (const [k, v] of campos) B.push(`- Campo **${k}** editado em ${pct(v, st.entradas)}% das passagens`);
    if (!fortes.length && !campos.length) B.push("- Sem padrão forte nos logs.");
    if (st?.entradas) {
      B.push("", "## O que acontece na etapa", "");
      B.push(`- Arquivos recebidos em ${pct(st.docQualquer, st.entradas)}% das passagens: ${top(st.comDoc, 6).map(([k, v]) => `${folderLabel.get(k) ?? k} ${pct(v, st.entradas)}%`).join(" · ") || "—"}`);
      B.push(`- Comentários: ${(st.comentarios / st.entradas).toFixed(1)} por passagem · auditoria IA em ${pct(st.comAuditoria, st.entradas)}%`);
      if (Object.keys(st.etapas).length) B.push(`- Etapa do checklist: ${top(st.etapas, 3).map(([k, v]) => `${k} (${v})`).join(" · ")}`);
      if (Object.keys(st.arquivados).length) B.push(`- Arquivados a partir daqui: ${fmtTop(st.arquivados, st.entradas)}`);
    }
    B.push("", "## Automações da coluna (ativas)", "");
    if (autos.length > 12) B.push(`- ${autos.length} automações (ex.: ${autos.slice(0, 5).join("; ")}…)`);
    else if (autos.length) for (const a of autos) B.push(`- ${a}`);
    else B.push("- Nenhuma.");
    B.push("", "## Hoje", "", `- ${td?.n ?? 0} card(s) ativos${td ? `; tags mais comuns: ${fmtTop(td.tags, td.n, 5)}` : ""}`);
    B.push("", "## Perguntas para confirmar (sim/não)", "");
    if (perguntas.length) perguntas.forEach((q, i) => B.push(`${i + 1}. ${q}`));
    else B.push("- Nenhuma: sem padrão forte para perguntar.");
    const fm = {
      kind: "extraido_dos_logs",
      status: "rascunho",
      fonte,
      coluna: l.name,
      redigido_por: null,
      validado_por: null,
      publicado_por: null,
      atualizado_em: hoje,
      pendente_humano: perguntas.length ? ["confirmar as perguntas sim/não com o dono"] : [],
    };
    writes.push([abs, rel, V.renderNote(fm, `\n${B.join("\n")}\n`)]);
  }

  // servicos/inss.md: a esteira = primeira coluna (com ≥ 20 saídas) em que a pasta fica ≥ 70% na saída.
  const relInss = "servicos/inss.md";
  const absInss = join(VAULT, relInss);
  if (podeEscrever(absInss)) {
    const esteira = [];
    for (const c of DOCUMENT_CATEGORIES) {
      const l = labels.find((x) => {
        const st = stats.get(x.name);
        return (st?.saidas ?? 0) >= 20 && pct(st.naSaida[c.id] ?? 0, st.saidas) >= FORTE;
      });
      if (l) esteira.push({ c, l, v: pct(stats.get(l.name).naSaida[c.id] ?? 0, stats.get(l.name).saidas) });
    }
    esteira.sort((a, b) => a.l.order - b.l.order);
    const B = [];
    B.push("# Serviço INSS — documentos por etapa", "");
    B.push(`> Rascunho **extraído dos logs** (${DIAS} dias até ${hoje}). Não existe lista oficial: esta é a esteira que a equipe pratica. Vira regra quando o dono confirmar.`, "");
    B.push("## Esteira (onde cada pasta passa a estar completa)", "");
    B.push("| ao sair de | pasta | % das saídas com a pasta |", "|---|---|---|");
    for (const e of esteira) B.push(`| ${linkCol(e.l).replace("|", "\\|")} | ${e.c.label} | ${e.v}% |`);
    B.push("", `Leitura: ${esteira.map((e) => e.c.label).join(" → ") || "—"}.`, "");
    B.push("## Colunas", "");
    for (const l of labels) B.push(`- ${linkCol(l)}${l.timeLimitDays ? ` · prazo ${l.timeLimitDays} d` : ""}`);
    B.push("", "## Perguntas para confirmar (sim/não)", "");
    esteira.forEach((e, i) => B.push(`${i + 1}. A pasta **${e.c.label}** tem que estar completa antes de sair de **${e.l.name}**? (${e.v}% das saídas)`));
    const fm = {
      kind: "extraido_dos_logs",
      status: "rascunho",
      fonte,
      redigido_por: null,
      validado_por: null,
      publicado_por: null,
      atualizado_em: hoje,
      pendente_humano: ["confirmar a esteira com o dono"],
    };
    writes.push([absInss, relInss, V.renderNote(fm, `\n${B.join("\n")}\n`)]);
  } else {
    pulei.push(relInss);
  }

  console.log(`Vault (etapas + serviço INSS): ${writes.length} a escrever, ${pulei.length} já redigidas/publicadas (não mexo)${args.apply ? "" : " — dry-run, use --apply"}`);
  for (const [, rel] of writes) console.log(`  ${rel}`);
  for (const rel of pulei) console.log(`  (pulei) ${rel}`);
  if (args.apply) {
    for (const [abs, , t] of writes) {
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, t);
    }
    console.log("Escrito. Rode `node -r dotenv/config scripts/vault-seed-hospitais.mjs --apply` para atualizar o Mapa da Operação.");
  }
}

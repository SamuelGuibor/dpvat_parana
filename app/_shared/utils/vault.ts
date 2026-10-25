// Vault da operação (docs/operacao/): lógica pura compartilhada pelo seed
// (scripts/vault-seed-hospitais.mjs), pelo validador determinístico
// (scripts/vault-check.mjs), pelo sync do S3 e pela ferramenta
// consultar_hospital. Testado em tests/vault.test.ts.
//
// Por que tudo aqui: o `fonte_hash` gravado na nota tem que ser calculado
// EXATAMENTE igual no seed, no check e na ferramenta — senão toda nota vira
// "desatualizado" (ou nenhuma vira). Uma função só, um teste só.
//
// Frontmatter: YAML em uma linha por campo, com listas/objetos em JSON
// (YAML aceita JSON como "flow style", então o Obsidian lê normalmente). Assim
// o parser é trivial e não depende de pacote de YAML.

import { createHash } from "node:crypto";
import { extractContacts, normEmail, normPhone, normUrl, type Contatos } from "./contacts";

export { extractContacts, normEmail, normPhone, normUrl, type Contatos };

export const HOSPITAL_PREFIX = "[HOSPITAL] ";
export const NOTE_KINDS = ["oficial", "extraido_do_codigo", "extraido_dos_logs", "sugestao_ia"] as const;
export const NOTE_STATUSES = ["rascunho", "em_validacao", "publicado", "desatualizado"] as const;
export const MODOS = ["email", "whatsapp", "presencial", "site"] as const;
export const HOSPITAL_SECTIONS = [
  "Como pedir",
  "Contato",
  "Documentos e procuração",
  "Prazo e retorno",
  "Observações",
  "Fonte",
] as const;

export type NoteKind = (typeof NOTE_KINDS)[number];
export type NoteStatus = (typeof NOTE_STATUSES)[number];
export type Frontmatter = Record<string, unknown>;

/** Ordem dos campos ao gravar (campos fora da lista vão no fim). */
export const FRONTMATTER_ORDER = [
  "kind",
  "status",
  "fonte",
  "fonte_hash",
  "hospital",
  "ghost_id",
  "coluna",
  "modo",
  "contatos",
  "procuracao",
  "prazo",
  "cards_ativos",
  "redigido_por",
  "validado_por",
  "publicado_por",
  "atualizado_em",
  "pendente_humano",
];

// ---------------------------------------------------------------- nomes

/** "[HOSPITAL] Hosp. São José – Curitiba" → "HOSP SAO JOSE CURITIBA". */
export function normalizeHospitalName(name: string): string {
  let s = (name ?? "").trim();
  if (s.toUpperCase().startsWith(HOSPITAL_PREFIX.trim().toUpperCase())) s = s.slice(HOSPITAL_PREFIX.trim().length);
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** "Hospital São José (Curitiba)" → "hospital-sao-jose-curitiba" (máx. 80). */
export function slugify(name: string): string {
  const s = normalizeHospitalName(name).toLowerCase().replace(/ /g, "-");
  return (s || "sem-nome").slice(0, 80).replace(/-+$/, "");
}

// ---------------------------------------------------------------- fonte e hash

export type AutomationActionLike = { type?: string; templateText?: string; templateFileName?: string };
export type AutomationLike = { id: string; actions: unknown };

function actionsOf(a: AutomationLike): AutomationActionLike[] {
  return Array.isArray(a.actions) ? (a.actions as AutomationActionLike[]) : [];
}

/**
 * Texto "da fonte" de uma automação: o comentário (literal) e o nome dos
 * anexos `file`. É o que vai no bloco `## Fonte` da nota e o que entra no hash.
 */
export function automationSourceText(a: AutomationLike): string {
  const parts: string[] = [];
  for (const act of actionsOf(a)) {
    if (act.type === "comment" && act.templateText?.trim()) parts.push(act.templateText.replace(/\r\n/g, "\n").trim());
    if (act.type === "file" && act.templateFileName) parts.push(`[anexo] ${act.templateFileName}`);
  }
  return parts.join("\n\n");
}

/** Nomes dos anexos `file` da automação. */
export function automationAttachments(a: AutomationLike): string[] {
  return actionsOf(a)
    .filter((x) => x.type === "file" && x.templateFileName)
    .map((x) => String(x.templateFileName));
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Hash da fonte de uma nota que junta 1+ automações (ordem por id, estável). */
export function sourceHash(automations: AutomationLike[]): string {
  const sorted = [...automations].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return sha256(sorted.map((a) => `${a.id}\n${automationSourceText(a)}`).join("\n\n---\n\n"));
}

/** "automation:a, automation:b" → ["a","b"]; outras fontes → []. */
export function fonteAutomationIds(fonte: unknown): string[] {
  if (typeof fonte !== "string") return [];
  return fonte
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("automation:"))
    .map((s) => s.slice("automation:".length).trim())
    .filter(Boolean);
}

// ---------------------------------------------------------------- contatos

/** Contatos de `inner` que NÃO aparecem em `outer` (comparação normalizada). */
export function contactsNotIn(inner: Contatos, outer: Contatos): string[] {
  const oe = new Set(outer.email.map(normEmail));
  const op = new Set(outer.telefone.map(normPhone));
  const ou = outer.site.map(normUrl);
  const out: string[] = [];
  for (const e of inner.email) if (!oe.has(normEmail(e))) out.push(e);
  for (const p of inner.telefone) if (!op.has(normPhone(p))) out.push(p);
  // Link: aceita o mesmo endereço ou um prefixo dele (o redator pode encurtar
  // um link do Drive para o domínio, nunca inventar outro).
  for (const u of inner.site) {
    const n = normUrl(u);
    if (!ou.some((o) => o === n || o.startsWith(`${n}/`) || o.startsWith(`${n}?`))) out.push(u);
  }
  return out;
}

// ---------------------------------------------------------------- frontmatter

function serializeValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") {
    // String "simples" sai crua (mais legível no Obsidian); o resto vira JSON.
    return /^[\p{L}\p{N}][\p{L}\p{N} _./@-]*$/u.test(v) && !/^(null|true|false|\d+)$/i.test(v) ? v : JSON.stringify(v);
  }
  return JSON.stringify(v);
}

export function serializeFrontmatter(fm: Frontmatter): string {
  const keys = [
    ...FRONTMATTER_ORDER.filter((k) => k in fm),
    ...Object.keys(fm).filter((k) => !FRONTMATTER_ORDER.includes(k)),
  ];
  return ["---", ...keys.map((k) => `${k}: ${serializeValue(fm[k])}`), "---"].join("\n");
}

function parseValue(raw: string): unknown {
  const s = raw.trim();
  if (s === "" || s === "null" || s === "~") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.startsWith("[") || s.startsWith("{") || s.startsWith('"')) return JSON.parse(s);
  return s;
}

export type ParsedNote = { fm: Frontmatter; body: string; errors: string[] };

export function parseNote(text: string): ParsedNote {
  const src = (text ?? "").replace(/\r\n/g, "\n");
  const errors: string[] = [];
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { fm: {}, body: src, errors: ["sem frontmatter (--- ... ---) no início"] };
  const fm: Frontmatter = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf(":");
    if (i <= 0) {
      errors.push(`linha de frontmatter inválida: "${line}"`);
      continue;
    }
    const key = line.slice(0, i).trim();
    try {
      fm[key] = parseValue(line.slice(i + 1));
    } catch {
      errors.push(`valor inválido em "${key}" (listas/objetos em JSON numa linha só)`);
    }
  }
  return { fm, body: src.slice(m[0].length), errors };
}

export function renderNote(fm: Frontmatter, body: string): string {
  return `${serializeFrontmatter(fm)}\n${body.replace(/^\n+/, "\n")}`.replace(/\n*$/, "\n");
}

/** Seções `## Título` do corpo → { título: conteúdo }. */
export function sections(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = body.split(/^## +/m);
  for (const p of parts.slice(1)) {
    const nl = p.indexOf("\n");
    const title = (nl < 0 ? p : p.slice(0, nl)).trim();
    out[title] = nl < 0 ? "" : p.slice(nl + 1).trim();
  }
  return out;
}

/** Corpo sem a seção Fonte (o que o redator escreveu). */
export function bodyWithoutFonte(body: string): string {
  return body.replace(/^## +Fonte\b[\s\S]*?(?=^## |(?![\s\S]))/m, "");
}

// ---------------------------------------------------------------- decisão do seed

export type SeedDecision = "criar" | "atualizar" | "pular" | "desatualizar";

/**
 * O seed nunca destrói trabalho de agente/pessoa:
 * - nota nova → criar;
 * - fonte igual → pular;
 * - fonte mudou numa nota que ninguém redigiu ainda (rascunho sem redigido_por) → atualizar o esqueleto;
 * - fonte mudou em qualquer outra (redigida, em validação, publicada) → desatualizar (só o status muda).
 */
export function decideSeed(existing: Frontmatter | null, newHash: string): SeedDecision {
  if (!existing) return "criar";
  // Nota escrita por pessoa (/conhecimento implementar) não tem automação como
  // fonte: o seed não mexe; o conflito com a automação é a skill que mostra.
  if (existing.kind === "oficial") return "pular";
  if (existing.fonte_hash === newHash) return "pular";
  if (existing.status === "desatualizado") return "pular";
  if (existing.status === "rascunho" && !existing.redigido_por) return "atualizar";
  return "desatualizar";
}

// ---------------------------------------------------------------- validação

const isStrList = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === "string");
const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Regras determinísticas de uma nota (caminho relativo a docs/operacao/).
 * Devolve a lista de problemas; vazio = ok. Não consulta banco.
 */
export function checkNote(relPath: string, text: string): string[] {
  const { fm, body, errors } = parseNote(text);
  const errs = [...errors];
  if (errors.length && !Object.keys(fm).length) return errs;
  const isHospital = relPath.replace(/\\/g, "/").startsWith("hospitais/");

  if (!NOTE_KINDS.includes(fm.kind as NoteKind)) errs.push(`kind inválido (${String(fm.kind)}); use ${NOTE_KINDS.join(" | ")}`);
  if (!NOTE_STATUSES.includes(fm.status as NoteStatus)) errs.push(`status inválido (${String(fm.status)}); use ${NOTE_STATUSES.join(" | ")}`);
  if (typeof fm.fonte !== "string" || !fm.fonte.trim()) errs.push("fonte vazia");
  if (fonteAutomationIds(fm.fonte).length && (typeof fm.fonte_hash !== "string" || !/^[0-9a-f]{64}$/.test(fm.fonte_hash)))
    errs.push("fonte de automação exige fonte_hash (sha256)");
  if (!isDate(fm.atualizado_em)) errs.push("atualizado_em deve ser AAAA-MM-DD");
  if (!isStrList(fm.pendente_humano)) errs.push("pendente_humano deve ser lista (JSON) de textos");
  if (fm.modo !== undefined && fm.modo !== null) {
    if (!isStrList(fm.modo)) errs.push("modo deve ser lista");
    else for (const m of fm.modo as string[]) if (!MODOS.includes(m as (typeof MODOS)[number])) errs.push(`modo desconhecido: ${m}`);
  }

  if (fm.status === "publicado") {
    if (!fm.validado_por) errs.push("publicado sem validado_por");
    if (!fm.publicado_por) errs.push("publicado sem publicado_por");
    if (isStrList(fm.pendente_humano) && (fm.pendente_humano as string[]).length) errs.push("publicado com pendente_humano não vazio");
  }
  if ((fm.status === "em_validacao" || fm.status === "publicado") && !fm.redigido_por) errs.push(`${fm.status} sem redigido_por`);

  if (isHospital) {
    if (typeof fm.hospital !== "string" || !fm.hospital.trim()) errs.push("nota de hospital sem campo hospital");
    const secs = sections(body);
    if (!("Fonte" in secs)) errs.push("nota de hospital sem seção ## Fonte");
    if (fm.status !== "rascunho" || fm.redigido_por) {
      for (const s of HOSPITAL_SECTIONS) if (!(s in secs)) errs.push(`falta a seção ## ${s}`);
    }
    // Nada de contato inventado: corpo (sem a Fonte) e frontmatter ⊂ Fonte.
    const fonte = extractContacts(secs.Fonte ?? "");
    const fromBody = extractContacts(bodyWithoutFonte(body));
    const c = (fm.contatos ?? {}) as Partial<Contatos>;
    const fromFm: Contatos = {
      email: isStrList(c.email) ? c.email! : [],
      telefone: isStrList(c.telefone) ? c.telefone! : [],
      site: isStrList(c.site) ? c.site! : [],
    };
    for (const x of contactsNotIn(fromBody, fonte)) errs.push(`contato no corpo que não está na Fonte: ${x}`);
    for (const x of contactsNotIn(fromFm, fonte)) errs.push(`contato no frontmatter que não está na Fonte: ${x}`);
  }
  return errs;
}

/** [[alvo]] e [[alvo|rótulo]] de um texto. */
export function wikilinks(text: string): string[] {
  return [...(text ?? "").matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)].map((m) => m[1].trim());
}

// ---------------------------------------------------------------- índice

export type IndexEntry = { path: string; title: string; status: string };

const INDEX_GROUPS: { dir: string; title: string }[] = [
  { dir: "servicos", title: "Serviços" },
  { dir: "etapas", title: "Etapas do kanban" },
  { dir: "modelos", title: "Modelos" },
  { dir: "regras", title: "Regras da operação" },
  { dir: "hospitais", title: "Hospitais" },
  { dir: "_relatorios", title: "Relatórios gerados" },
];

/** Título da nota: primeiro `# ` do corpo, senão o nome do arquivo. */
export function noteTitle(relPath: string, text: string): string {
  const h = (text ?? "").match(/^# +(.+)$/m);
  return h ? h[1].trim() : relPath.replace(/\\/g, "/").split("/").pop()!.replace(/\.md$/, "");
}

/** `Mapa da Operação.md` (gerado): wikilinks agrupados por pasta, com o status. */
export function renderIndex(entries: IndexEntry[], geradoEm: string): string {
  const lines = [
    "# Mapa da Operação",
    "",
    `> Gerado em ${geradoEm} pelos scripts do vault (não edite à mão: rode \`node -r dotenv/config scripts/vault-seed-hospitais.mjs --apply\`).`,
    "> Só nota com status **publicado** vale como procedimento. Rascunho/em validação/desatualizado é material de trabalho.",
    "",
  ];
  for (const g of INDEX_GROUPS) {
    const items = entries
      .filter((e) => e.path.startsWith(`${g.dir}/`))
      .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    if (!items.length) continue;
    const pub = items.filter((e) => e.status === "publicado").length;
    lines.push(`## ${g.title} (${items.length}${g.dir === "_relatorios" ? "" : ` · ${pub} publicadas`})`, "");
    for (const e of items) lines.push(`- [[${e.path.replace(/\.md$/, "")}|${e.title}]]${e.status ? ` · ${e.status}` : ""}`);
    lines.push("");
  }
  return lines.join("\n");
}

/** Amostra determinística (para o relatório de lote poder ser refeito). */
export function sampleOf<T>(items: T[], fraction: number, seed: string): T[] {
  const n = items.length ? Math.max(1, Math.round(items.length * fraction)) : 0;
  return [...items]
    .map((it, i) => ({ it, k: sha256(`${seed}:${i}`) }))
    .sort((a, b) => (a.k < b.k ? -1 : 1))
    .slice(0, n)
    .map((x) => x.it);
}

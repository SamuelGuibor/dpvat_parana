// Diagnóstico das mídias do WhatsApp quebradas por rename e purga (auditoria
// de 24/09, DOC-1 e DOC-6). Lógica PURA de `scripts/reparar-midias-renomeadas.mjs`:
// o script lê o banco e o bucket e entrega aqui só os dados; aqui se decide a
// categoria e a ação de cada referência quebrada (sem I/O, testável).
//
// Como o estrago aconteceu (até o PR01, commit 7b367cd):
// - renomear um Document copiava o objeto para `<mesma pasta>/<Date.now()>-<nome>`
//   e APAGAVA a key antiga. Quando o anexo tinha vindo da conversa, a key antiga
//   era a `mediaKey` da mensagem: a bolha quebrou e o Document passou a apontar
//   para a cópia (key nova que nenhuma mensagem referencia);
// - quem reanexava a mesma mensagem depois criava outro Document com a key
//   antiga, quebrado no card desde o nascimento;
// - a purga da lixeira apagava o objeto mesmo com mensagem ainda usando a key.
//
// O reparo (--apply, PR24) nunca apaga nada: restaura a versão do objeto (bucket
// versionado) ou aponta a mensagem para a cópia renomeada, e o CSV de resultado
// (old→new) é o rollback do --desfazer. O que sobra sem par (purgado/ambíguo) só
// volta reenviando; na thread ele aparece como "Arquivo indisponível" pelo
// fallback de UI do PR14.

import { contactIdFromWhatsAppKey, isSharedLibraryKey } from "./s3-keys";
import { extensionFromKey } from "./doc-name";

export type MediaRepairOrigin = "mensagem" | "documento" | "fluxo" | "template";

export type MediaRepairCategory =
  /** Mensagem com mídia sumida e cópia renomeada pareada (1↔1 ou por ordem). */
  | "rename_pareavel"
  /** Mensagem com mídia sumida, sem cópia renomeada e sem Document com a key (a purga levou o objeto). */
  | "purgado"
  /** Document ATIVO apontando para key que não existe mais no bucket. */
  | "doc_quebrado"
  /** Document na lixeira apontando para key que sumiu (só relatório: sai na purga). */
  | "doc_quebrado_lixeira"
  /** Mensagem com mídia sumida sem par seguro (contagens diferentes, data incoerente...). */
  | "ambiguo"
  /** Passo de fluxo ou cabeçalho de template com mídia sumida (e as mensagens que usam essa key). */
  | "biblioteca"
  /** Document em whatsapp/flows/ que ninguém usa: cópia de mídia de fluxo renomeada. */
  | "fluxo_renomeado";

export type MediaRepairAction =
  /** CopyObject da última versão boa para a MESMA key (bucket versionado); não mexe no banco. */
  | "restaurar_versao"
  /** Mensagem passa a usar a key da cópia renomeada (par único no contato). */
  | "apontar_para_doc"
  /** Idem, mas pareado por ordem de data entre n mensagens e n cópias (só com --incluir-ordem). */
  | "par_por_ordem"
  /** Document reanexado com a key antiga vai para a lixeira (a cópia renomeada fica no card). */
  | "soft_delete_doc"
  /** Só relatório: reenviar a mídia pela tela de Fluxos ou Templates. */
  | "reenviar_pela_tela"
  /** Só relatório. */
  | "nenhuma";

export type MediaRepairConfidence = "alta" | "media" | "";

export type RepairMessage = {
  id: string;
  contactId: string;
  mediaKey: string;
  createdAt: Date;
};

export type RepairDocument = {
  id: string;
  key: string;
  /** Dono do card (Document.userId, obrigatório mesmo em doc de processo). */
  userId: string;
  /** COALESCE(createdAt, uploadedAt): quando o anexo entrou no card. */
  createdAt: Date;
  deletedAt: Date | null;
};

export type RepairLibraryRef = {
  origin: "fluxo" | "template";
  /** id do WhatsAppFlow ou do WhatsAppTemplate. */
  id: string;
  key: string;
};

export type MediaRepairInput = {
  /** A key existe no bucket (listagem + HEAD dos avulsos). */
  exists: (key: string) => boolean;
  /** Mensagens com mediaKey (as que existem no bucket são ignoradas). */
  messages: RepairMessage[];
  /** Documents com key em whatsapp/, inclusive os da lixeira. */
  documents: RepairDocument[];
  library: RepairLibraryRef[];
  /** key sumida → versionId restaurável (versão que não é delete marker). */
  versions?: ReadonlyMap<string, string>;
  /** key → action do log que registrou a saída do Document (document_purge/document_remove). */
  evidence?: ReadonlyMap<string, string>;
  /** Par por ordem entra no --apply (confiança média). */
  includeOrderPairs: boolean;
  /** A credencial tem s3:GetObjectVersion (sem isso restaurar_versao não roda). */
  canRestoreVersion: boolean;
};

export type MediaRepairRow = {
  origem: MediaRepairOrigin;
  /** id da mensagem, do Document, do fluxo ou do template. */
  id: string;
  /** Contato da key ("" nas bibliotecas). */
  contactId: string;
  categoria: MediaRepairCategory;
  acao: MediaRepairAction;
  oldKey: string;
  /** Key da cópia renomeada (apontar_para_doc, par_por_ordem, soft_delete_doc). */
  newKey: string;
  /** Versão a restaurar (restaurar_versao). */
  versionId: string;
  /** Document renomeado usado no par. */
  docId: string;
  confianca: MediaRepairConfidence;
  /** O --apply (PR24) agiria nesta linha com as flags atuais. */
  aplica: boolean;
  /** Log que confirma a saída do Document com essa key. */
  evidencia: string;
};

// `<pasta>/<Date.now()>-<nome>` era a key gerada pelo rename antigo. A mídia
// recebida do cliente tem o mesmo formato (`whatsapp/<cid>/<ts>-<nome>`), por
// isso a cópia renomeada só é reconhecida junto com "nenhuma mensagem aponta
// para ela". O rascunho da ficha (`/docs/`) fica de fora: renomear rascunho
// nunca mexeu no S3.
const CONTACT_RENAMED_RE = /^whatsapp\/[^/]+\/\d{13}-[^/]+$/;
const FLOW_RENAMED_RE = /^whatsapp\/flows\/\d{13}-[^/]+$/;

/** Key com cara de cópia renomeada na pasta de um contato (sem olhar o banco). */
export function looksLikeRenamedContactKey(key: string): boolean {
  return CONTACT_RENAMED_RE.test(key) && !isSharedLibraryKey(key);
}

/** Grupo de pareamento: mesmo contato e mesma extensão (o rename preservava a extensão da key). */
function groupOf(key: string): string | null {
  const cid = contactIdFromWhatsAppKey(key);
  if (!cid) return null;
  return `${cid}|${extensionFromKey(key).toLowerCase()}`;
}

type Pair = { doc: RepairDocument; action: "apontar_para_doc" | "par_por_ordem" };

/**
 * Pareia as keys sumidas das mensagens com as cópias renomeadas do mesmo grupo.
 * - 1 key ↔ 1 cópia: `apontar_para_doc` (alta);
 * - n ↔ n: por ordem de data (1ª mensagem ↔ 1º anexo), `par_por_ordem` (média);
 * - contagens diferentes ou algum anexo mais velho que a mensagem: sem par.
 * O anexo nunca é anterior à mensagem (só se anexa o que já chegou), então
 * `Document.createdAt < mensagem.createdAt` derruba o par.
 */
function pairGroup(
  keys: { key: string; firstAt: Date }[],
  cands: RepairDocument[],
): Map<string, Pair> {
  const out = new Map<string, Pair>();
  if (!keys.length || keys.length !== cands.length) return out;
  const ks = [...keys].sort((a, b) => a.firstAt.getTime() - b.firstAt.getTime() || a.key.localeCompare(b.key));
  const ds = [...cands].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  if (ks.some((k, i) => ds[i].createdAt.getTime() < k.firstAt.getTime())) return out;
  const action = ks.length === 1 ? "apontar_para_doc" : "par_por_ordem";
  ks.forEach((k, i) => out.set(k.key, { doc: ds[i], action }));
  return out;
}

/** Categoria e ação de toda referência quebrada (mensagem, Document, fluxo, template). */
export function planMediaRepair(input: MediaRepairInput): MediaRepairRow[] {
  const { exists, versions = new Map(), evidence = new Map() } = input;
  const rows: MediaRepairRow[] = [];

  const restore = (key: string) => {
    const versionId = versions.get(key);
    return versionId ? { versionId, aplica: input.canRestoreVersion } : null;
  };

  // Keys usadas por passo de fluxo/template: a cópia em whatsapp/flows/ que um
  // fluxo usa não é "fluxo renomeado", mesmo sem mensagem enviada ainda.
  const libraryKeys = new Set(input.library.map((l) => l.key));
  const messageKeys = new Set(input.messages.map((m) => m.mediaKey));

  // 1) Keys sumidas das mensagens, com a data da 1ª mensagem que usa cada uma.
  const missingMsgs = input.messages.filter((m) => !exists(m.mediaKey));
  const firstAt = new Map<string, Date>();
  for (const m of missingMsgs) {
    const cur = firstAt.get(m.mediaKey);
    if (!cur || m.createdAt < cur) firstAt.set(m.mediaKey, m.createdAt);
  }

  // 2) Cópias renomeadas candidatas: existem no bucket, nenhuma mensagem
  // aponta, pasta de contato (inclusive as da lixeira: a cópia ainda está lá).
  const candidates = input.documents.filter(
    (d) => looksLikeRenamedContactKey(d.key) && !messageKeys.has(d.key) && exists(d.key),
  );

  // 3) Pareamento por grupo (contato + extensão).
  const keysByGroup = new Map<string, { key: string; firstAt: Date }[]>();
  for (const [key, at] of firstAt) {
    const g = groupOf(key);
    if (!g) continue;
    const list = keysByGroup.get(g) ?? [];
    list.push({ key, firstAt: at });
    keysByGroup.set(g, list);
  }
  const candsByGroup = new Map<string, RepairDocument[]>();
  for (const d of candidates) {
    const g = groupOf(d.key);
    if (!g) continue;
    const list = candsByGroup.get(g) ?? [];
    list.push(d);
    candsByGroup.set(g, list);
  }
  const pairs = new Map<string, Pair>();
  for (const [g, keys] of keysByGroup) {
    for (const [k, p] of pairGroup(keys, candsByGroup.get(g) ?? [])) pairs.set(k, p);
  }
  const pairApplies = (p: Pair) => p.action === "apontar_para_doc" || input.includeOrderPairs;

  const docsByKey = new Map<string, RepairDocument[]>();
  for (const d of input.documents) {
    const list = docsByKey.get(d.key) ?? [];
    list.push(d);
    docsByKey.set(d.key, list);
  }

  // 4) Uma linha por mensagem quebrada.
  for (const m of missingMsgs) {
    const key = m.mediaKey;
    const base = {
      origem: "mensagem" as const,
      id: m.id,
      contactId: contactIdFromWhatsAppKey(key) ?? m.contactId,
      oldKey: key,
      evidencia: evidence.get(key) ?? "",
    };
    const pair = pairs.get(key);
    const g = groupOf(key);
    const hadCandidates = Boolean(g && candsByGroup.get(g)?.length);
    // Mensagem de fluxo/template usa a key da biblioteca: o conserto é o do
    // passo (linha "biblioteca"); as bolhas antigas só voltam com a versão.
    const categoria: MediaRepairCategory = isSharedLibraryKey(key)
      ? "biblioteca"
      : pair
        ? "rename_pareavel"
        : !hadCandidates && (evidence.has(key) || !docsByKey.has(key))
          ? "purgado"
          : "ambiguo";
    const r = restore(key);
    if (r) {
      // A versão restaurada é exata e dispensa o pareamento heurístico.
      rows.push({ ...base, categoria, acao: "restaurar_versao", newKey: "", versionId: r.versionId, docId: "", confianca: "alta", aplica: r.aplica });
    } else if (pair) {
      rows.push({
        ...base,
        categoria,
        acao: pair.action,
        newKey: pair.doc.key,
        versionId: "",
        docId: pair.doc.id,
        confianca: pair.action === "apontar_para_doc" ? "alta" : "media",
        aplica: pairApplies(pair),
      });
    } else {
      rows.push({ ...base, categoria, acao: "nenhuma", newKey: "", versionId: "", docId: "", confianca: "", aplica: false });
    }
  }

  // 5) Documents apontando para key sumida.
  for (const d of input.documents) {
    if (exists(d.key)) continue;
    const base = {
      origem: "documento" as const,
      id: d.id,
      contactId: contactIdFromWhatsAppKey(d.key) ?? "",
      oldKey: d.key,
      evidencia: evidence.get(d.key) ?? "",
    };
    const categoria: MediaRepairCategory = d.deletedAt ? "doc_quebrado_lixeira" : "doc_quebrado";
    const r = restore(d.key);
    if (r) {
      rows.push({ ...base, categoria, acao: "restaurar_versao", newKey: "", versionId: r.versionId, docId: "", confianca: "alta", aplica: r.aplica });
      continue;
    }
    // Reanexado depois do rename: a mensagem vai apontar para a cópia
    // renomeada, que já está ATIVA no mesmo card; este fica sobrando e quebrado.
    const pair = pairs.get(d.key);
    if (
      !d.deletedAt &&
      pair &&
      pair.doc.id !== d.id &&
      pair.doc.userId === d.userId &&
      !pair.doc.deletedAt
    ) {
      rows.push({
        ...base,
        categoria,
        acao: "soft_delete_doc",
        newKey: pair.doc.key,
        versionId: "",
        docId: pair.doc.id,
        confianca: pair.action === "apontar_para_doc" ? "alta" : "media",
        aplica: pairApplies(pair),
      });
      continue;
    }
    rows.push({ ...base, categoria, acao: "nenhuma", newKey: "", versionId: "", docId: "", confianca: "", aplica: false });
  }

  // 6) Fluxos e templates: só relatório (a correção é reenviar pela tela),
  // salvo bucket versionado.
  for (const l of input.library) {
    if (exists(l.key)) continue;
    const r = restore(l.key);
    rows.push({
      origem: l.origin,
      id: l.id,
      contactId: "",
      categoria: "biblioteca",
      acao: r ? "restaurar_versao" : "reenviar_pela_tela",
      oldKey: l.key,
      newKey: "",
      versionId: r?.versionId ?? "",
      docId: "",
      confianca: r ? "alta" : "",
      aplica: r?.aplica ?? false,
      evidencia: evidence.get(l.key) ?? "",
    });
  }

  // 7) Cópia de mídia de fluxo renomeada: o passo do fluxo perdeu a key, e a
  // cópia só existe como Document. Só relatório (conferir junto das linhas
  // "biblioteca"; a correção é reenviar pela tela de Fluxos).
  for (const d of input.documents) {
    if (!FLOW_RENAMED_RE.test(d.key) || messageKeys.has(d.key) || libraryKeys.has(d.key) || !exists(d.key)) continue;
    rows.push({
      origem: "documento",
      id: d.id,
      contactId: "",
      categoria: "fluxo_renomeado",
      acao: "nenhuma",
      oldKey: d.key,
      newKey: "",
      versionId: "",
      docId: "",
      confianca: "",
      aplica: false,
      evidencia: "",
    });
  }

  return rows;
}

export type MediaRepairSummary = {
  porCategoria: Record<string, number>;
  porAcao: Record<string, number>;
  aplicaveis: number;
  keysSumidas: number;
  contatos: number;
  mensagens: number;
};

/** Contagens para o console (sem keys: elas carregam nomes digitados pela equipe). */
export function summarizeMediaRepair(rows: MediaRepairRow[]): MediaRepairSummary {
  const porCategoria: Record<string, number> = {};
  const porAcao: Record<string, number> = {};
  const keys = new Set<string>();
  const contacts = new Set<string>();
  let aplicaveis = 0;
  let mensagens = 0;
  for (const r of rows) {
    porCategoria[r.categoria] = (porCategoria[r.categoria] ?? 0) + 1;
    porAcao[r.acao] = (porAcao[r.acao] ?? 0) + 1;
    if (r.aplica) aplicaveis += 1;
    if (r.origem === "mensagem") mensagens += 1;
    if (r.categoria !== "fluxo_renomeado") keys.add(r.oldKey);
    if (r.contactId) contacts.add(r.contactId);
  }
  return { porCategoria, porAcao, aplicaveis, keysSumidas: keys.size, contatos: contacts.size, mensagens };
}

const CSV_COLUMNS: (keyof MediaRepairRow)[] = [
  "origem",
  "id",
  "contactId",
  "categoria",
  "acao",
  "confianca",
  "aplica",
  "oldKey",
  "newKey",
  "versionId",
  "docId",
  "evidencia",
];

function toCsv<T>(columns: (keyof T)[], rows: T[]): string {
  const cell = (v: unknown) => `"${String(typeof v === "boolean" ? (v ? "sim" : "nao") : v).replace(/"/g, '""')}"`;
  const lines = [columns.map(cell).join(",")];
  for (const r of rows) lines.push(columns.map((c) => cell(r[c])).join(","));
  return lines.join("\n") + "\n";
}

/** CSV com todas as colunas entre aspas (a key pode ter vírgula, aspas ou ponto e vírgula). */
export function mediaRepairCsv(rows: MediaRepairRow[]): string {
  return toCsv(CSV_COLUMNS, rows);
}

// ---------------------------------------------------------------------------
// --apply (PR24): do CSV revisado ao que se escreve em produção.
//
// O --apply NÃO confia no CSV sozinho nem no plano recalculado sozinho: só
// escreve a linha que a revisão marcou "sim" E que o plano recalculado na hora
// ainda traz idêntica e aplicável. Assim uma key editada no CSV, uma mensagem
// consertada no meio do caminho ou um par que mudou desde a revisão viram
// "pulado" em vez de escrita às cegas. Linha aplicável que não passou pela
// revisão (dado novo) também não entra: rode o dry-run de novo e revise.
// ---------------------------------------------------------------------------

/** Autor do soft-delete do Document reanexado quebrado (a lixeira do card mostra "por reparo-midia"). */
export const MEDIA_REPAIR_DELETED_BY = "reparo-midia";

export type MediaRepairResultStatus = "aplicado" | "pulado" | "erro" | "desfeito";

/** Linha do CSV de resultado do --apply/--desfazer (o do dry-run vem com as duas colunas vazias). */
export type MediaRepairResultRow = MediaRepairRow & {
  resultado: MediaRepairResultStatus | "";
  detalhe: string;
};

const RESULT_COLUMNS: (keyof MediaRepairResultRow)[] = [...CSV_COLUMNS, "resultado", "detalhe"];

/** CSV de resultado: o do dry-run + `resultado` e `detalhe`. É o arquivo de rollback do --desfazer. */
export function mediaRepairResultCsv(rows: MediaRepairResultRow[]): string {
  return toCsv(RESULT_COLUMNS, rows);
}

// O separador sai do cabeçalho: quem abre o CSV no Excel em pt-BR para mudar a
// coluna "aplica" costuma salvar com ";".
function detectCsvDelimiter(src: string): "," | ";" {
  let inQuotes = false;
  let commas = 0;
  let semicolons = 0;
  for (const ch of src) {
    if (ch === '"') inQuotes = !inQuotes; // aspas dobradas alternam duas vezes
    else if (!inQuotes) {
      if (ch === "\n" || ch === "\r") break;
      if (ch === ",") commas += 1;
      else if (ch === ";") semicolons += 1;
    }
  }
  return semicolons > commas ? ";" : ",";
}

/**
 * CSV (RFC 4180): campo entre aspas com aspas dobradas, separador ou quebra de
 * linha dentro; CRLF ou LF; BOM do Excel ignorado; linha em branco descartada.
 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const sep = detectCsvDelimiter(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch !== '"') field += ch;
      else if (src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else inQuotes = false;
    } else if (ch === '"') inQuotes = true;
    else if (ch === sep) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (inQuotes) throw new Error("CSV com aspas sem fechar.");
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

const ORIGINS: readonly MediaRepairOrigin[] = ["mensagem", "documento", "fluxo", "template"];
const CATEGORIES: readonly MediaRepairCategory[] = [
  "rename_pareavel",
  "purgado",
  "doc_quebrado",
  "doc_quebrado_lixeira",
  "ambiguo",
  "biblioteca",
  "fluxo_renomeado",
];
const ACTIONS: readonly MediaRepairAction[] = [
  "restaurar_versao",
  "apontar_para_doc",
  "par_por_ordem",
  "soft_delete_doc",
  "reenviar_pela_tela",
  "nenhuma",
];
const CONFIDENCES: readonly MediaRepairConfidence[] = ["alta", "media", ""];
const RESULTS: readonly (MediaRepairResultStatus | "")[] = ["aplicado", "pulado", "erro", "desfeito", ""];

function oneOf<T extends string>(allowed: readonly T[], value: string, column: string, line: number): T {
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`Linha ${line} do CSV: valor desconhecido em "${column}": "${value}".`);
}

/**
 * Lê o CSV do dry-run (ou o de resultado do --apply). Keys e ids ficam como
 * estão (sem trim: a key é comparada byte a byte com o plano); `aplica` só é
 * verdadeiro com "sim". Coluna faltando ou valor fora do vocabulário = erro,
 * para um CSV editado à mão não virar escrita inesperada.
 */
export function readMediaRepairCsv(text: string): MediaRepairResultRow[] {
  const [header, ...lines] = parseCsv(text);
  if (!header) throw new Error("CSV vazio.");
  const index = new Map(header.map((h, i) => [h.trim(), i]));
  const missing = CSV_COLUMNS.filter((c) => !index.has(c));
  if (missing.length) {
    throw new Error(`CSV sem as colunas ${missing.join(", ")}: use o CSV gerado pelo dry-run do script.`);
  }
  return lines.map((cells, n) => {
    const line = n + 2;
    const raw = (col: string) => {
      const i = index.get(col);
      return i === undefined ? "" : (cells[i] ?? "");
    };
    const word = (col: string) => raw(col).trim().toLowerCase();
    return {
      origem: oneOf(ORIGINS, word("origem"), "origem", line),
      id: raw("id"),
      contactId: raw("contactId"),
      categoria: oneOf(CATEGORIES, word("categoria"), "categoria", line),
      acao: oneOf(ACTIONS, word("acao"), "acao", line),
      confianca: oneOf(CONFIDENCES, word("confianca"), "confianca", line),
      aplica: word("aplica") === "sim",
      oldKey: raw("oldKey"),
      newKey: raw("newKey"),
      versionId: raw("versionId"),
      docId: raw("docId"),
      evidencia: raw("evidencia"),
      resultado: oneOf(RESULTS, word("resultado"), "resultado", line),
      detalhe: raw("detalhe"),
    };
  });
}

/** Identidade de uma linha do plano: o que a revisão aprovou tem que bater campo a campo. */
export function mediaRepairRowId(r: MediaRepairRow): string {
  return [r.origem, r.id, r.acao, r.oldKey, r.newKey, r.versionId, r.docId].join("\u0000");
}

const isMessageRepoint = (r: MediaRepairRow) =>
  r.origem === "mensagem" && (r.acao === "apontar_para_doc" || r.acao === "par_por_ordem");
const pairKey = (r: MediaRepairRow) => `${r.oldKey}\u0000${r.newKey}`;

// Ordem de escrita: restaurar o objeto (S3) → apontar mensagens → soft-delete
// do reanexado, que só faz sentido depois de o par ter sido aceito.
const ACTION_ORDER: Partial<Record<MediaRepairAction, number>> = {
  restaurar_versao: 0,
  apontar_para_doc: 1,
  par_por_ordem: 1,
  soft_delete_doc: 2,
};

function notApplicableReason(r: MediaRepairRow): string {
  if (r.acao === "par_por_ordem" || (r.acao === "soft_delete_doc" && r.confianca === "media")) {
    return "par por ordem: só aplica rodando com --incluir-ordem";
  }
  if (r.acao === "restaurar_versao") return "a credencial não tem s3:GetObjectVersion";
  return "o plano atual não aplica esta linha (só relatório)";
}

export type MediaRepairSkip = { row: MediaRepairRow; motivo: string };

export type MediaRepairSelection = {
  /** O que o --apply escreve, já na ordem de escrita. */
  aprovadas: MediaRepairRow[];
  puladas: MediaRepairSkip[];
  /** Aplicáveis no plano atual que não estão no CSV revisado (dado novo: rode o dry-run e revise). */
  naoRevisadas: number;
  /** Aplicáveis no plano atual que a revisão marcou "nao". */
  recusadas: number;
};

/**
 * Cruza o plano recalculado agora (`fresh`) com o CSV revisado. Só passa a
 * linha marcada "sim" na revisão que existe idêntica no plano atual e que o
 * plano atual aplica. O soft-delete do Document reanexado exige que o par
 * mensagem → cópia renomeada (mesmas oldKey/newKey) também tenha sido aprovado:
 * se a revisão duvidou do par, o reanexado fica como está.
 */
export function selectReviewedRepairs(
  fresh: MediaRepairRow[],
  reviewed: MediaRepairRow[],
  opts: { inScope?: (r: MediaRepairRow) => boolean } = {},
): MediaRepairSelection {
  const inScope = opts.inScope ?? (() => true);
  const freshById = new Map(fresh.map((r) => [mediaRepairRowId(r), r]));
  const reviewedIds = new Set(reviewed.map(mediaRepairRowId));
  const approvedIds = new Set(reviewed.filter((r) => r.aplica).map(mediaRepairRowId));

  const ok: MediaRepairRow[] = [];
  const puladas: MediaRepairSkip[] = [];
  const seen = new Set<string>();
  for (const r of reviewed) {
    if (!r.aplica) continue;
    const id = mediaRepairRowId(r);
    if (seen.has(id)) continue;
    seen.add(id);
    if (!inScope(r)) {
      puladas.push({ row: r, motivo: "fora do escopo do --contact" });
      continue;
    }
    const f = freshById.get(id);
    if (!f) {
      puladas.push({ row: r, motivo: "não está no plano atual (já reparada ou mudou desde a revisão)" });
    } else if (!f.aplica) {
      puladas.push({ row: f, motivo: notApplicableReason(f) });
    } else ok.push(f);
  }

  const approvedPairs = new Set(ok.filter(isMessageRepoint).map(pairKey));
  const aprovadas: MediaRepairRow[] = [];
  for (const r of ok) {
    if (r.acao === "soft_delete_doc" && !approvedPairs.has(pairKey(r))) {
      puladas.push({ row: r, motivo: "o par da mensagem (oldKey → newKey) não foi aprovado na revisão" });
    } else aprovadas.push(r);
  }
  aprovadas.sort((a, b) => (ACTION_ORDER[a.acao] ?? 9) - (ACTION_ORDER[b.acao] ?? 9));

  let naoRevisadas = 0;
  let recusadas = 0;
  for (const f of fresh) {
    if (!f.aplica || !inScope(f)) continue;
    const id = mediaRepairRowId(f);
    if (!reviewedIds.has(id)) naoRevisadas += 1;
    else if (!approvedIds.has(id)) recusadas += 1;
  }
  return { aprovadas, puladas, naoRevisadas, recusadas };
}

export type MediaRepairWrites = {
  /** Um CopyObject por key (mensagens e Documents da mesma key dividem a restauração). */
  restaurar: { key: string; versionId: string }[];
  /** UPDATE da mediaKey com guarda pelo valor antigo. */
  mensagens: MediaRepairRow[];
  /** Soft-delete do Document reanexado (deletedBy "reparo-midia"). */
  documentos: MediaRepairRow[];
};

export function groupRepairWrites(aprovadas: MediaRepairRow[]): MediaRepairWrites {
  const restore = new Map<string, string>();
  const mensagens: MediaRepairRow[] = [];
  const documentos: MediaRepairRow[] = [];
  for (const r of aprovadas) {
    if (r.acao === "restaurar_versao") {
      if (!restore.has(r.oldKey)) restore.set(r.oldKey, r.versionId);
    } else if (isMessageRepoint(r)) mensagens.push(r);
    else if (r.acao === "soft_delete_doc" && r.origem === "documento") documentos.push(r);
  }
  return { restaurar: [...restore].map(([key, versionId]) => ({ key, versionId })), mensagens, documentos };
}

export type MediaRepairUndo = {
  /** Mensagens que voltam para a key antiga (guarda: ainda apontam para a nova). */
  mensagens: MediaRepairResultRow[];
  /** Documents que saem da lixeira (guarda: deletedBy "reparo-midia"). */
  documentos: MediaRepairResultRow[];
  /** Restaurações de versão aplicadas: não se desfazem (só trouxeram o objeto de volta, o banco não mudou). */
  semDesfazer: number;
};

/** Rollback a partir do CSV de resultado do --apply: só o que saiu "aplicado". */
export function planMediaRepairUndo(rows: MediaRepairResultRow[]): MediaRepairUndo {
  const out: MediaRepairUndo = { mensagens: [], documentos: [], semDesfazer: 0 };
  for (const r of rows) {
    if (r.resultado !== "aplicado") continue;
    if (isMessageRepoint(r) && r.newKey) out.mensagens.push(r);
    else if (r.acao === "soft_delete_doc" && r.origem === "documento") out.documentos.push(r);
    else if (r.acao === "restaurar_versao") out.semDesfazer += 1;
  }
  return out;
}

/**
 * CopySource de uma versão para o CopyObject: `bucket/key` URL-encoded por
 * segmento (a key tem espaço, acento e o nome digitado pela equipe) +
 * `?versionId=`. Restaurar = copiar a versão boa para a MESMA key, que vira a
 * versão atual; nada é apagado.
 */
export function versionCopySource(bucket: string, key: string, versionId: string): string {
  const encoded = `${bucket}/${key}`.split("/").map(encodeURIComponent).join("/");
  return `${encoded}?versionId=${encodeURIComponent(versionId)}`;
}

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
// versionado) ou aponta a mensagem para a cópia renomeada, e o CSV old→new serve
// de rollback. O que sobra sem par (purgado/ambíguo) só volta reenviando; na
// thread ele aparece como "Arquivo indisponível" pelo fallback de UI do PR14.

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

/** CSV com todas as colunas entre aspas (a key pode ter vírgula, aspas ou ponto e vírgula). */
export function mediaRepairCsv(rows: MediaRepairRow[]): string {
  const cell = (v: unknown) => `"${String(typeof v === "boolean" ? (v ? "sim" : "nao") : v).replace(/"/g, '""')}"`;
  const lines = [CSV_COLUMNS.map(cell).join(",")];
  for (const r of rows) lines.push(CSV_COLUMNS.map((c) => cell(r[c])).join(","));
  return lines.join("\n") + "\n";
}

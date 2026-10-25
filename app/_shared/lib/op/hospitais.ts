// Hospitais × automações × vault publicado: leitura compartilhada pela
// ferramenta consultar_hospital e pelo quadro "Cérebro APP" (indicadores,
// lacunas, desatualizadas). Só leitura. Etapa 2 do AI-First.
//
// A verdade operacional é a automação ativa da coluna "DISTRIBUIÇÃO DE
// SOLICITAÇÕES" com condição "hospital igual a <nome>"; a nota publicada no S3
// (operacao-vault/) é a versão redigida e validada, e fica "desatualizada"
// quando o hash da automação viva difere do `fonte_hash` gravado nela.

import { db } from "../prisma";
import { readVaultText } from "../s3-presign";
import { ACTIVE_CARD_WHERE } from "./cards";
import { normalizeHospitalName, parseNote, sourceHash } from "@/app/_shared/utils/vault";
import { ghostContactFromNote } from "@/app/_shared/utils/hospital-contact";

export const COLUNA_HOSPITAIS = "DISTRIBUICAO DE SOLICITACOES";
const INDEX_KEY = "operacao-vault/index.json";
const INDEX_TTL_MS = 5 * 60_000;

export type HospitalAutomation = {
  id: string;
  name: string;
  conditions: unknown;
  actions: unknown;
  updatedAt: Date;
};
export type HospitalGroup = { key: string; nome: string; autos: HospitalAutomation[]; hash: string };

/** Automações ativas da coluna, agrupadas pelo nome normalizado do hospital. */
export async function loadHospitalGroups(): Promise<Map<string, HospitalGroup>> {
  const labels = await db.label.findMany({ select: { id: true, name: true } });
  const col = labels.find((l) => normalizeHospitalName(l.name) === COLUNA_HOSPITAIS);
  const grupos = new Map<string, HospitalGroup>();
  if (!col) return grupos;
  const autos = await db.automation.findMany({
    where: { triggerLabelId: col.id, isActive: true },
    select: { id: true, name: true, conditions: true, actions: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
  });
  for (const a of autos) {
    const conds = Array.isArray(a.conditions) ? (a.conditions as { field?: string; operator?: string; value?: string }[]) : [];
    const nome = conds.find((c) => c?.field === "hospital" && c?.operator === "equals" && c.value?.trim())?.value?.trim();
    if (!nome) continue;
    const key = normalizeHospitalName(nome);
    const g = grupos.get(key) ?? { key, nome, autos: [], hash: "" };
    g.autos.push(a);
    grupos.set(key, g);
  }
  for (const g of grupos.values()) g.hash = sourceHash(g.autos);
  return grupos;
}

export type VaultIndexNota = {
  path: string;
  titulo?: string;
  hospital?: string | null;
  hospital_norm: string | null;
  coluna?: string | null;
  fonte_hash: string | null;
  atualizado_em: string | null;
};

let indexCache: { at: number; notas: VaultIndexNota[] } | null = null;

/** Manifesto das notas publicadas (sobe pelo scripts/sync-vault-s3.mjs). Cache de 5 min. */
export async function loadVaultIndex(): Promise<VaultIndexNota[]> {
  if (indexCache && Date.now() - indexCache.at < INDEX_TTL_MS) return indexCache.notas;
  const raw = await readVaultText(INDEX_KEY);
  let notas: VaultIndexNota[] = [];
  // Índice corrompido = sem nota (a automação viva continua respondendo).
  try {
    notas = raw ? ((JSON.parse(raw) as { notas?: VaultIndexNota[] }).notas ?? []) : [];
  } catch {
    console.warn("[op] operacao-vault/index.json inválido; seguindo sem notas");
  }
  indexCache = { at: Date.now(), notas };
  return notas;
}

/** Hospital (nome normalizado) → nº de cards ativos com ele cadastrado. */
export async function activeCardsByHospital(): Promise<Map<string, { nome: string; n: number }>> {
  const cards = await db.user.findMany({ where: { ...ACTIVE_CARD_WHERE, hospital: { not: null } }, select: { hospital: true } });
  const out = new Map<string, { nome: string; n: number }>();
  for (const c of cards) {
    const k = normalizeHospitalName(c.hospital ?? "");
    if (!k) continue;
    const e = out.get(k) ?? { nome: (c.hospital ?? "").trim(), n: 0 };
    e.n++;
    out.set(k, e);
  }
  return out;
}

export interface HospitalContact {
  ghost: { id: string; nome: string | null } | null;
  /** Colunas hospital_* do GHOST (preenchidas só por nota publicada). */
  cadastro: { email: string | null; telefone: string | null; modo: string | null; obs: string | null } | null;
  /** E-mail para o pedido: do cadastro do GHOST; sem ele, o ÚNICO e-mail da nota publicada. */
  email: string | null;
  fonteEmail: "cadastro" | "nota" | null;
  notaCaminho: string | null;
}

/** Contato do hospital pelo nome (o do card ou o digitado). Só leitura. */
export async function hospitalContactFor(hospital: string): Promise<HospitalContact> {
  const key = normalizeHospitalName(hospital);
  const ghosts = await db.user.findMany({
    where: { role: "GHOST" },
    select: { id: true, name: true, hospital_email: true, hospital_telefone: true, hospital_modo: true, hospital_obs: true },
  });
  const g = key ? ghosts.find((x) => normalizeHospitalName(x.name ?? "") === key) ?? null : null;
  const cadastro = g
    ? { email: g.hospital_email, telefone: g.hospital_telefone, modo: g.hospital_modo, obs: g.hospital_obs }
    : null;
  const out: HospitalContact = {
    ghost: g ? { id: g.id, nome: g.name } : null,
    cadastro,
    email: cadastro?.email ?? null,
    fonteEmail: cadastro?.email ? "cadastro" : null,
    notaCaminho: null,
  };
  if (out.email || !key) return out;
  const entrada = (await loadVaultIndex()).find((n) => n.hospital_norm === key);
  if (!entrada) return out;
  const raw = await readVaultText(`operacao-vault/${entrada.path}`);
  if (!raw) return out;
  const contato = ghostContactFromNote(parseNote(raw).fm);
  if (contato.email) {
    out.email = contato.email;
    out.fonteEmail = "nota";
    out.notaCaminho = `docs/operacao/${entrada.path}`;
  }
  return out;
}

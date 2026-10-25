// Dados vivos do quadro "Cérebro APP" (aba Tickets da nova-dash): indicadores
// do vault, lacunas (hospital de card ativo sem procedimento), notas
// publicadas desatualizadas e os lotes de publicação para a conferência da
// amostra. Só leitura (banco + S3 operacao-vault/). Etapa 2 do AI-First,
// docs/ai-first/02-plano-etapa-2.md §9.

import { db } from "./prisma";
import { readVaultText } from "./s3-presign";
import { activeCardsByHospital, loadHospitalGroups, loadVaultIndex } from "./op/hospitais";

export type CerebroResumo = {
  publicadas: number;
  hospitaisComAutomacao: number;
  desatualizadas: { nota: string; hospital: string | null }[];
  lacunas: { hospital: string; cardsAtivos: number }[];
  ticketsAbertos: number;
  lotes: LoteResumo[];
};

export type LoteResumo = { id: string; data: string; aprovadas: number; devolvidas: number; pendentes: number; amostra: number };

export type LoteAmostraNota = {
  nota: string;
  titulo: string;
  hospital: string | null;
  automacao: string | null;
  fonte: string;
  secoes: Record<string, string>;
  contatos: { email: string[]; telefone: string[]; site: string[] };
  modo: string[] | null;
  procuracao: string | null;
};

export type Lote = {
  id: string;
  data: string;
  aprovadas: string[];
  devolvidas: string[];
  pendentes: string[];
  amostra: LoteAmostraNota[];
};

const LOTE_ID_RE = /^[\w-]{1,60}$/;

async function loadLotesIndex(): Promise<LoteResumo[]> {
  const raw = await readVaultText("operacao-vault/index.json");
  if (!raw) return [];
  try {
    const lotes = (JSON.parse(raw) as { lotes?: LoteResumo[] }).lotes ?? [];
    return [...lotes].sort((a, b) => b.id.localeCompare(a.id));
  } catch {
    return [];
  }
}

export async function getCerebroResumo(): Promise<CerebroResumo> {
  const [grupos, index, cards, ticketsAbertos, lotes] = await Promise.all([
    loadHospitalGroups(),
    loadVaultIndex(),
    activeCardsByHospital(),
    db.devTicket.count({ where: { status: { not: "CONCLUIDO" }, type: { in: ["BUG", "ALTERACAO", "MELHORIA", "OUTRO"] } } }),
    loadLotesIndex(),
  ]);
  const desatualizadas = index
    .filter((n) => n.hospital_norm && n.fonte_hash)
    .filter((n) => {
      const g = grupos.get(n.hospital_norm!);
      // Automação apagada/desativada também deixa a nota sem fonte viva.
      return !g || g.hash !== n.fonte_hash;
    })
    .map((n) => ({ nota: n.path, hospital: n.hospital ?? null }));
  const lacunas = [...cards.entries()]
    .filter(([k]) => !grupos.has(k))
    .map(([, e]) => ({ hospital: e.nome, cardsAtivos: e.n }))
    .sort((a, b) => b.cardsAtivos - a.cardsAtivos);
  return {
    publicadas: index.length,
    hospitaisComAutomacao: grupos.size,
    desatualizadas,
    lacunas,
    ticketsAbertos,
    lotes,
  };
}

/** Lote de publicação (sobe pelo sync como operacao-vault/_lotes/<id>.json). */
export async function getLote(id: string): Promise<Lote | null> {
  if (!LOTE_ID_RE.test(id)) return null;
  const raw = await readVaultText(`operacao-vault/_lotes/${id}.json`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Lote;
  } catch {
    return null;
  }
}

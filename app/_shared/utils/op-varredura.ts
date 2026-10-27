// Checagens fixas da /varredura (Etapa 7), puras e testáveis
// (tests/op-varredura.test.ts). A ferramenta varrer_inconsistencias
// (app/_shared/lib/op/tools/varredura.ts) lê os cards ativos e os fluxos com
// select mínimo e chama `findInconsistencies`. Nenhuma checagem altera nada:
// cada item diz o card, a regra violada (com a fonte) e a evidência; a ação,
// se houver, é uma L3 com prévia, oferecida pela skill um card por vez.
//
// As regras abaixo são CHECAGENS DA IA, não regras oficiais: a IA nunca muda
// regra do vault nem automação a partir delas (vira sugestão).

import { isValidCpf } from "./format";
import { dayKeyDiff, OP_FLOW_BLOCKED_DAYS } from "./op-metrics";
import { brDayKey } from "./date-br";
import { isStale, parseWorkflowState } from "./workflows";

export const VARREDURA_CHECAGENS = ["cpf_repetido", "telefone_repetido", "cpf_invalido", "sem_hospital", "fluxo_bloqueado"] as const;
export type VarreduraChecagem = (typeof VARREDURA_CHECAGENS)[number];

/**
 * Colunas de pedido de prontuário (provisório, 25/10): as automações por
 * hospital disparam aqui; card sem hospital não casa com nenhuma.
 */
export const HOSPITAL_COLUMNS_RE = /HOSPITAL|DISTRIBUI[CÇ][AÃ]O DE SOLICITA/i;

export const VARREDURA_REGRAS: Record<VarreduraChecagem, { regra: string; fonte: string }> = {
  cpf_repetido: {
    regra: "O mesmo CPF em dois ou mais cards ativos — costuma ser card duplicado do mesmo cliente.",
    fonte: "checagem fixa da IA (Etapa 7, provisória) — não é regra oficial do vault",
  },
  telefone_repetido: {
    regra: "O mesmo telefone (8 últimos dígitos) em cards ativos de CPFs diferentes — conferir se é o mesmo cliente ou um parente.",
    fonte: "checagem fixa da IA (Etapa 7, provisória) — mesma régua de vínculo do inbox (8 últimos dígitos)",
  },
  cpf_invalido: {
    regra: "CPF preenchido que não passa no dígito verificador — procuração, pedido e INSS saem errados.",
    fonte: "checagem fixa da IA (Etapa 7) — dígito verificador do CPF",
  },
  sem_hospital: {
    regra: "Card numa coluna de pedido de prontuário sem hospital — as automações por hospital da coluna não disparam.",
    fonte: "automações por hospital (DISTRIBUIÇÃO DE SOLICITAÇÕES), base das notas de hospital do vault",
  },
  fluxo_bloqueado: {
    regra: `Fluxo da IA bloqueado há mais de ${OP_FLOW_BLOCKED_DAYS} dias — o operador parou e não voltou (/retomar).`,
    fonte: "progresso dos fluxos (op_workflows, Etapa 6 + ajuste H de 26/10)",
  },
};

export interface VarreduraCard {
  id: string;
  cardNumber: number | null;
  nome: string | null;
  coluna: string;
  cpf: string | null;
  telefone: string | null;
  hospital: string | null;
  outroHospital: string | null;
  /** Item C (27/10): só para os cards de grupo repetido (a ferramenta busca depois de achar os grupos). */
  stats?: VarreduraCardStats;
}

export interface VarreduraCardStats {
  documentos: number;
  comentarios: number;
  diasNaColuna: number | null;
  /** AAAA-MM-DD (Brasília). */
  criadoEm: string | null;
}

/** Um card dentro de um grupo repetido, como sai na evidência. */
export interface VarreduraGrupoCard extends VarreduraCardStats {
  id: string;
  cardNumber: number | null;
  nome: string | null;
  coluna: string;
}

/** Item C: ids dos cards que caem em cpf_repetido/telefone_repetido (para buscar as contagens só deles). */
export function duplicateCardIds(cards: VarreduraCard[]): string[] {
  const r = findInconsistencies({ cards, flows: [], checagens: ["cpf_repetido", "telefone_repetido"], limite: 10_000 });
  const ids = new Set<string>();
  for (const i of r.itens) for (const c of (i.evidencia.cards as VarreduraGrupoCard[] | undefined) ?? []) ids.add(c.id);
  return [...ids];
}

/**
 * Qual manter num grupo repetido: mais documentos, depois mais comentários,
 * depois o mais antigo (criadoEm), depois o menor nº. Os outros = arquivar.
 * Heurística da IA, não regra oficial: a skill mostra e o operador decide.
 */
export function sugerirManter(cards: VarreduraGrupoCard[]): { manter: number | null; arquivar: (number | null)[]; motivo: string } {
  const sorted = [...cards].sort(
    (a, b) =>
      b.documentos - a.documentos ||
      b.comentarios - a.comentarios ||
      (a.criadoEm ?? "9999").localeCompare(b.criadoEm ?? "9999") ||
      (a.cardNumber ?? Infinity) - (b.cardNumber ?? Infinity),
  );
  const [m, ...rest] = sorted;
  const motivo =
    rest.length && m.documentos > rest[0].documentos
      ? "tem mais documentos"
      : rest.length && m.comentarios > rest[0].comentarios
        ? "tem mais comentários"
        : rest.length && m.criadoEm && rest[0].criadoEm && m.criadoEm < rest[0].criadoEm
          ? "é o mais antigo"
          : "empate: o de menor número";
  return { manter: m?.cardNumber ?? null, arquivar: rest.map((c) => c.cardNumber), motivo };
}

export interface VarreduraFlow {
  /** op_requests.id do prompt de origem. */
  id: string;
  operatorId: string;
  state: unknown;
}

export interface VarreduraItem {
  checagem: VarreduraChecagem;
  card: { id: string; cardNumber: number | null; nome: string | null; coluna: string };
  regra: string;
  fonte: string;
  evidencia: Record<string, unknown>;
}

export interface VarreduraResult {
  totais: Record<VarreduraChecagem, number>;
  total: number;
  mostrados: number;
  itens: VarreduraItem[];
}

const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

export function findInconsistencies(input: {
  cards: VarreduraCard[];
  flows: VarreduraFlow[];
  checagens?: readonly VarreduraChecagem[];
  limite: number;
  agora?: Date;
}): VarreduraResult {
  const agora = input.agora ?? new Date();
  const on = new Set<VarreduraChecagem>(input.checagens?.length ? input.checagens : VARREDURA_CHECAGENS);
  const itens: VarreduraItem[] = [];
  const cardOut = (c: VarreduraCard) => ({ id: c.id, cardNumber: c.cardNumber, nome: c.nome, coluna: c.coluna });
  const push = (checagem: VarreduraChecagem, c: VarreduraCard, evidencia: Record<string, unknown>) =>
    itens.push({ checagem, card: cardOut(c), ...VARREDURA_REGRAS[checagem], evidencia });
  // Item C (27/10): UM item por grupo repetido (antes era um por card, dobrando
  // o limite), com as contagens de cada card e a sugestão de qual manter.
  const grupoCards = (group: VarreduraCard[]): VarreduraGrupoCard[] =>
    group.map((c) => ({ ...cardOut(c), documentos: c.stats?.documentos ?? 0, comentarios: c.stats?.comentarios ?? 0, diasNaColuna: c.stats?.diasNaColuna ?? null, criadoEm: c.stats?.criadoEm ?? null }));
  const pushGrupo = (checagem: VarreduraChecagem, group: VarreduraCard[], campo: Record<string, unknown>) => {
    const cards = grupoCards(group);
    const sugestao = sugerirManter(cards);
    const manter = group.find((c) => c.cardNumber === sugestao.manter) ?? group[0];
    push(checagem, manter, { ...campo, cards, sugestao });
  };

  if (on.has("cpf_repetido") || on.has("telefone_repetido")) {
    const byCpf = new Map<string, VarreduraCard[]>();
    const byPhone = new Map<string, VarreduraCard[]>();
    for (const c of input.cards) {
      const cpf = digits(c.cpf);
      if (cpf.length === 11) byCpf.set(cpf, [...(byCpf.get(cpf) ?? []), c]);
      const tel = digits(c.telefone);
      if (tel.length >= 10) byPhone.set(tel.slice(-8), [...(byPhone.get(tel.slice(-8)) ?? []), c]);
    }
    if (on.has("cpf_repetido")) {
      for (const [cpf, group] of byCpf) {
        if (group.length < 2) continue;
        pushGrupo("cpf_repetido", group, { campo: "cpf", valor: cpf });
      }
    }
    if (on.has("telefone_repetido")) {
      for (const [fim, group] of byPhone) {
        if (group.length < 2) continue;
        const cpfs = new Set(group.map((c) => digits(c.cpf)).filter((d) => d.length === 11));
        // Mesmo CPF já sai no cpf_repetido; aqui só CPFs diferentes (ou faltando).
        if (cpfs.size <= 1 && group.every((c) => digits(c.cpf).length === 11)) continue;
        pushGrupo("telefone_repetido", group, { campo: "telefone", final: fim });
      }
    }
  }

  if (on.has("cpf_invalido")) {
    for (const c of input.cards) {
      const cpf = digits(c.cpf);
      if (cpf && !isValidCpf(cpf)) push("cpf_invalido", c, { campo: "cpf", valor: c.cpf });
    }
  }

  if (on.has("sem_hospital")) {
    for (const c of input.cards) {
      if (!HOSPITAL_COLUMNS_RE.test(c.coluna)) continue;
      if (!(c.hospital ?? "").trim() && !(c.outroHospital ?? "").trim()) push("sem_hospital", c, { campo: "hospital", valor: null, coluna: c.coluna });
    }
  }

  if (on.has("fluxo_bloqueado")) {
    const byId = new Map(input.cards.map((c) => [c.id, c]));
    for (const f of input.flows) {
      const state = parseWorkflowState(f.state);
      if (!state || state.status !== "bloqueado" || !state.bloqueio || isStale(state, agora)) continue;
      const dias = dayKeyDiff(brDayKey(new Date(state.bloqueio.em)), brDayKey(agora));
      if (dias <= OP_FLOW_BLOCKED_DAYS) continue;
      const card = byId.get(state.card.id);
      // Card arquivado/fora do filtro de coluna: a varredura é dos ativos.
      if (!card) continue;
      push("fluxo_bloqueado", card, {
        fluxo: f.id,
        workflow: state.workflow,
        passo: state.bloqueio.passo,
        tipo: state.bloqueio.tipo,
        ...(state.bloqueio.codigo ? { codigo: state.bloqueio.codigo } : {}),
        ...(state.bloqueio.campos?.length ? { campos: state.bloqueio.campos } : {}),
        diasBloqueado: dias,
        operadorId: f.operatorId,
      });
    }
  }

  const totais = Object.fromEntries(VARREDURA_CHECAGENS.map((k) => [k, 0])) as Record<VarreduraChecagem, number>;
  for (const i of itens) totais[i.checagem]++;
  // Ordem: por coluna, depois pela ordem das checagens; o limite corta o fim.
  const order = new Map(VARREDURA_CHECAGENS.map((k, i) => [k, i]));
  itens.sort((a, b) => a.card.coluna.localeCompare(b.card.coluna, "pt-BR") || order.get(a.checagem)! - order.get(b.checagem)! || (a.card.cardNumber ?? 0) - (b.card.cardNumber ?? 0));
  const shown = itens.slice(0, input.limite);
  return { totais, total: itens.length, mostrados: shown.length, itens: shown };
}

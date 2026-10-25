// Leitura das métricas da Operação por IA (Etapa 7) a partir de op_*.
// Uma lib só para a tela do gestor (app/_actions/op/metrics.ts), a ferramenta
// gerar_relatorio e a skill /auditoria-operacao — o número é o mesmo nos três.
//
// Regras (medidas no passo 0 do plano da Etapa 7):
// - corte de data SEMPRE (dias de Brasília → instantes, `resolveOpPeriod`);
// - select mínimo: NUNCA `op_requests.text` nem `args` (de ferramenta ou de
//   aprovação) nas métricas — `confirmar`/`noop` saem calculados no SQL;
// - nada de `distinct`+`orderBy` (tabelas crescem a cada prompt); os tetos
//   abaixo seguram o pior caso;
// - o texto dos prompts sai só por `getOpPrompts`, chamado só pela action com
//   `manager_dashboard` (decisão 7), paginado e com token `crmop_…` mascarado.

import { Prisma } from "@prisma/client";
import { db } from "../prisma";
import { CARD_WHERE, columnName } from "./cards";
import {
  buildOpMetrics,
  classifyPrompt,
  type MetricApproval,
  type MetricCall,
  type MetricFlow,
  type MetricPrompt,
  type OpMetrics,
  type OpPeriod,
  type PromptClass,
} from "@/app/_shared/utils/op-metrics";

const MAX_PROMPTS = 20_000;
const MAX_CALLS = 50_000;
const MAX_APPROVALS = 5_000;
const MAX_FLOWS = 500;
const MAX_CARD_LOOKUP = 400;
/**
 * Fluxo aberto de antes do período entra só na lista "parados" (com origem
 * até 90 dias antes do fim do período): sem esse corte o ramo dos abertos
 * varreria op_requests inteira (sem índice em state nem em createdAt sozinho).
 */
const OPEN_FLOW_LOOKBACK_DAYS = 90;

export interface OpMetricsView extends OpMetrics {
  /** operatorId → nome (equipe). */
  nomes: Record<string, string>;
  /** cardId → nº, nome e coluna atual (cards citados nas listas). */
  cardsInfo: Record<string, { cardNumber: number | null; nome: string | null; coluna: string; arquivado: string | null }>;
  /** Tetos atingidos (número pode estar cortado). */
  cortado: boolean;
}

interface CallRow {
  id: string;
  operatorId: string;
  requestId: string | null;
  sessionId: string | null;
  tool: string;
  level: number;
  ok: boolean;
  code: string | null;
  confirmed: boolean | null;
  noop: boolean | null;
  cardIds: string[];
  durationMs: number;
  createdAt: Date;
}

/** Linhas cruas do período (sem texto nem args). Exportado para os testes. */
export async function loadOpMetricRows(periodo: Pick<OpPeriod, "gte" | "lt">, operatorId?: string | null) {
  const opFilter = operatorId ? Prisma.sql`AND "operatorId" = ${operatorId}` : Prisma.empty;
  const [prompts, calls, approvals, flows] = await Promise.all([
    db.opRequest.findMany({
      where: { createdAt: { gte: periodo.gte, lt: periodo.lt }, ...(operatorId ? { operatorId } : {}) },
      orderBy: { createdAt: "asc" },
      take: MAX_PROMPTS,
      select: { id: true, operatorId: true, sessionId: true, skill: true, createdAt: true },
    }),
    // `args` fica no banco: só o booleano `confirmar` sai (a mesma régua do
    // scripts/op-relatorio.mjs). summary "noop…" = L3 que não mudou nada.
    db.$queryRaw<CallRow[]>(Prisma.sql`
      SELECT id, "operatorId", "requestId", "sessionId", tool, level, ok, code,
             COALESCE(args->>'confirmar' = 'true', false) AS confirmed,
             COALESCE(summary LIKE 'noop%', false) AS noop,
             "cardIds", "durationMs", "createdAt"
      FROM op_tool_calls
      WHERE "createdAt" >= ${periodo.gte} AND "createdAt" < ${periodo.lt} ${opFilter}
      ORDER BY "createdAt" ASC
      LIMIT ${MAX_CALLS}
    `),
    db.opApproval.findMany({
      where: { createdAt: { gte: periodo.gte, lt: periodo.lt }, ...(operatorId ? { operatorId } : {}) },
      orderBy: { createdAt: "desc" },
      take: MAX_APPROVALS,
      select: { id: true, operatorId: true, canal: true, status: true, cardId: true, expiresAt: true, createdAt: true },
    }),
    // Fluxos do período + os ainda abertos de antes (a tela mostra o que está
    // parado hoje). state só tem ids (schema v1 da Etapa 6).
    db.$queryRaw<{ id: string; operatorId: string; createdAt: Date; state: unknown }[]>(Prisma.sql`
      SELECT id, "operatorId", "createdAt", state
      FROM op_requests
      WHERE state IS NOT NULL
        AND (("createdAt" >= ${periodo.gte} AND "createdAt" < ${periodo.lt})
             OR ("createdAt" >= ${new Date(periodo.lt.getTime() - OPEN_FLOW_LOOKBACK_DAYS * 86_400_000)} AND state->>'status' IN ('em_andamento', 'bloqueado')))
        ${opFilter}
      ORDER BY "createdAt" DESC
      LIMIT ${MAX_FLOWS}
    `),
  ]);
  const metricCalls: MetricCall[] = calls.map((c) => ({
    ...c,
    level: Number(c.level),
    durationMs: Number(c.durationMs),
    confirmed: c.confirmed === true,
    noop: c.noop === true,
    cardIds: c.cardIds ?? [],
  }));
  return {
    prompts: prompts as MetricPrompt[],
    calls: metricCalls,
    approvals: approvals as MetricApproval[],
    flows: flows as MetricFlow[],
    cortado: prompts.length >= MAX_PROMPTS || calls.length >= MAX_CALLS || approvals.length >= MAX_APPROVALS || flows.length >= MAX_FLOWS,
  };
}

async function namesOf(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const rows = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return Object.fromEntries(rows.map((r) => [r.id, r.name ?? r.id]));
}

async function cardsOf(ids: string[]): Promise<OpMetricsView["cardsInfo"]> {
  const unique = [...new Set(ids)].slice(0, MAX_CARD_LOOKUP);
  if (!unique.length) return {};
  const rows = await db.user.findMany({
    where: { ...CARD_WHERE, id: { in: unique } },
    select: { id: true, cardNumber: true, name: true, role: true, archiveStatus: true, label: { select: { name: true } } },
  });
  return Object.fromEntries(
    rows.map((r) => [r.id, { cardNumber: r.cardNumber, nome: r.name, coluna: columnName(r), arquivado: r.archiveStatus ?? null }]),
  );
}

/** Métricas do período (opcional: um operador), com nomes e cards resolvidos. */
export async function getOpMetrics(input: { periodo: OpPeriod; operatorId?: string | null; agora?: Date }): Promise<OpMetricsView> {
  const rows = await loadOpMetricRows(input.periodo, input.operatorId);
  const m = buildOpMetrics({ ...rows, periodo: input.periodo, agora: input.agora });
  const cardIds = [
    ...m.cards.conduzidos.map((c) => c.cardId),
    ...m.falhas.flatMap((f) => f.cardIds),
    ...m.aprovacoes.lista.map((a) => a.cardId).filter((x): x is string => !!x),
    ...m.fluxos.parados.map((f) => f.cardId),
  ];
  const [nomes, cardsInfo] = await Promise.all([namesOf(m.operadores.map((o) => o.operatorId)), cardsOf(cardIds)]);
  return { ...m, nomes, cardsInfo, cortado: rows.cortado };
}

// ---------------------------------------------------------------------------
// Texto dos prompts (só manager_dashboard — quem chama confere)
// ---------------------------------------------------------------------------

export const PROMPTS_PAGE_SIZE = 50;
const MAX_PROMPT_LIST = 200;
const PROMPT_TEXT_CHARS = 2_000;

/** Token do app colado no chat vira texto do prompt: nunca reexibir. */
export function maskOpToken(text: string): string {
  return text.replace(/crmop_[A-Za-z0-9_-]{8,}/g, "crmop_••••• (token do app — revogue e gere outro)");
}

export interface OpPromptItem {
  id: string;
  operatorId: string;
  operador: string;
  skill: string | null;
  classe: PromptClass;
  criadoEm: string;
  texto: string;
  ferramentas: string[];
}

export async function getOpPrompts(input: {
  periodo: OpPeriod;
  operatorId?: string | null;
  incluirConversas?: boolean;
  pagina?: number;
}): Promise<{ itens: OpPromptItem[]; total: number; pagina: number; paginas: number; cortado: boolean }> {
  // 1) Sem texto: classifica pelo que as ferramentas fizeram.
  const heads = await db.opRequest.findMany({
    where: { createdAt: { gte: input.periodo.gte, lt: input.periodo.lt }, ...(input.operatorId ? { operatorId: input.operatorId } : {}) },
    orderBy: { createdAt: "desc" },
    take: MAX_PROMPTS,
    select: { id: true, operatorId: true, skill: true, createdAt: true },
  });
  // Corte por data (op_tool_calls não tem índice em requestId): a ferramenta
  // liga ao prompt dos últimos 30 min, então o fim do período ganha essa folga.
  const calls = heads.length
    ? await db.opToolCall.findMany({
        where: {
          createdAt: { gte: input.periodo.gte, lt: new Date(input.periodo.lt.getTime() + 30 * 60_000) },
          requestId: { not: null },
          ...(input.operatorId ? { operatorId: input.operatorId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: MAX_CALLS,
        select: { requestId: true, tool: true, level: true },
      })
    : [];
  const byReq = new Map<string, { tool: string; level: number }[]>();
  for (const c of calls) if (c.requestId) byReq.set(c.requestId, [...(byReq.get(c.requestId) ?? []), c]);
  const classified = heads
    .map((h) => {
      const cs = byReq.get(h.id) ?? [];
      return { ...h, classe: classifyPrompt({ skill: h.skill, levels: cs.map((c) => c.level) }), ferramentas: [...new Set(cs.map((c) => c.tool))] };
    })
    .filter((h) => input.incluirConversas || h.classe !== "conversa");
  const listed = classified.slice(0, MAX_PROMPT_LIST);
  const paginas = Math.max(1, Math.ceil(listed.length / PROMPTS_PAGE_SIZE));
  const pagina = Math.min(Math.max(1, input.pagina ?? 1), paginas);
  const page = listed.slice((pagina - 1) * PROMPTS_PAGE_SIZE, pagina * PROMPTS_PAGE_SIZE);

  // 2) Texto só da página.
  const [texts, nomes] = await Promise.all([
    page.length ? db.opRequest.findMany({ where: { id: { in: page.map((p) => p.id) } }, select: { id: true, text: true } }) : [],
    namesOf([...new Set(page.map((p) => p.operatorId))]),
  ]);
  const textOf = new Map(texts.map((t) => [t.id, t.text]));
  return {
    itens: page.map((p) => ({
      id: p.id,
      operatorId: p.operatorId,
      operador: nomes[p.operatorId] ?? p.operatorId,
      skill: p.skill,
      classe: p.classe,
      criadoEm: p.createdAt.toISOString(),
      texto: maskOpToken((textOf.get(p.id) ?? "").slice(0, PROMPT_TEXT_CHARS)),
      ferramentas: p.ferramentas,
    })),
    total: classified.length,
    pagina,
    paginas,
    // Teto de ferramentas estourado = classificação dos mais antigos pode ter
    // errado (ação contada como conversa): avisa.
    cortado: classified.length > MAX_PROMPT_LIST || heads.length >= MAX_PROMPTS || calls.length >= MAX_CALLS,
  };
}

/** Membros da equipe que aparecem em op_* no período (filtro de operador da tela). */
export async function listOpOperators(periodo: Pick<OpPeriod, "gte" | "lt">): Promise<{ id: string; nome: string }[]> {
  const rows = await db.opSession.groupBy({
    by: ["operatorId"],
    where: { lastSeenAt: { gte: periodo.gte }, startedAt: { lt: periodo.lt } },
    _count: { _all: true },
  });
  const nomes = await namesOf(rows.map((r) => r.operatorId));
  return rows.map((r) => ({ id: r.operatorId, nome: nomes[r.operatorId] ?? r.operatorId })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}

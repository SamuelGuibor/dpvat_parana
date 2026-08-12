"use server";

import { db } from "@/app/_shared/lib/prisma";
import { requireTeam, requirePermission } from "@/app/_shared/lib/permissions-server";

// Funil REAL do kanban a partir dos logs de movimentação (action "move",
// metadata { from, to }) — substitui os dados fictícios que o dashboard
// exibia ("João Silva, Maria Santos…").

export interface FunnelStage {
  column: string;
  /** Cards que ENTRARAM nesta coluna no período. */
  entries: number;
  /** Tempo médio (em dias) que os cards ficaram na coluna antes de sair. */
  avgDaysBeforeLeaving: number | null;
}

export interface FunnelAnalytics {
  stages: FunnelStage[];
  totalMoves: number;
}

interface MoveMeta {
  from?: string | null;
  to?: string | null;
}

export async function getFunnelAnalytics(fromISO: string, toISO: string): Promise<FunnelAnalytics> {
  await requireTeam();

  const from = new Date(fromISO);
  const to = new Date(toISO);

  const logs = await db.log.findMany({
    where: { action: "move", createdAt: { gte: from, lte: to } },
    select: { userId: true, processId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 20_000,
  });

  const entries = new Map<string, number>();
  // Tempo na coluna: diferença entre movimentos consecutivos do MESMO card,
  // atribuída à coluna de origem (from) do segundo movimento.
  const dwell = new Map<string, { totalMs: number; n: number }>();
  const lastMoveByCard = new Map<string, { at: Date; to: string | null }>();

  for (const log of logs) {
    const meta = (log.metadata ?? {}) as MoveMeta;
    const to_ = typeof meta.to === "string" ? meta.to : null;
    const cardKey = log.processId ? `p:${log.processId}` : log.userId ? `u:${log.userId}` : null;

    if (to_) entries.set(to_, (entries.get(to_) ?? 0) + 1);

    if (cardKey) {
      const prev = lastMoveByCard.get(cardKey);
      if (prev?.to) {
        const ms = log.createdAt.getTime() - prev.at.getTime();
        if (ms > 0) {
          const d = dwell.get(prev.to) ?? { totalMs: 0, n: 0 };
          d.totalMs += ms;
          d.n += 1;
          dwell.set(prev.to, d);
        }
      }
      lastMoveByCard.set(cardKey, { at: log.createdAt, to: to_ });
    }
  }

  const stages: FunnelStage[] = [...entries.entries()]
    .map(([column, count]) => {
      const d = dwell.get(column);
      return {
        column,
        entries: count,
        avgDaysBeforeLeaving: d && d.n > 0 ? Math.round((d.totalMs / d.n / 86_400_000) * 10) / 10 : null,
      };
    })
    .sort((a, b) => b.entries - a.entries)
    .slice(0, 15);

  return { stages, totalMoves: logs.length };
}

// ============ Análise de fluxo do Kanban (11/08/2026) ============
// Tudo derivado dos logs action "move" (metadata { from, to, cardName }):
// tempo por coluna (média/maior/menor + mais lentos), destinos por coluna com
// fluxo esperado x fora do padrão, retornos (retrabalho), descarte pro
// "Nikolas Analisar" e tempo total no board.

const norm = (s: string) => s.trim().toUpperCase();

// Fluxos esperados (de → para). Qualquer destino fora da lista aparece
// marcado como "fora do padrão" — nunca é ignorado.
const EXPECTED_FLOWS: Record<string, string[]> = Object.fromEntries(
  Object.entries({
    "COLHER ASSINATURA": ["FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL"],
    "DISTRIBUIÇÃO DE SOLICITAÇÕES": [
      "SOLICITAR PRESENCIAL",
      "PROTOCOLO IMPRESSO NA PASTA DO HOSPITAL",
      "SOLICITADO, AGUARDANDO PROTOCOLO",
      "FALTA SENHA - SOLICITADO",
      "COM SENHA - SOLICITADO",
    ],
    "FALTA SENHA - SOLICITADO": [
      "RETIRAR PRESENCIAL",
      "PRONTUÁRIOS ATRASADOS",
      "INSS SENHA PRESENCIAL - THAISI",
      "DISTRIBUIÇÃO DE PROCESSOS",
    ],
    "COM SENHA - SOLICITADO": [
      "RETIRAR PRESENCIAL",
      "PRONTUÁRIOS ATRASADOS",
      "INSS SENHA PRESENCIAL - THAISI",
      "DISTRIBUIÇÃO DE PROCESSOS",
    ],
    "DISTRIBUIÇÃO DE PROCESSOS": ["AGENDAR PERÍCIA ADM", "FAZER ROTEIRO PREV"],
  }).map(([k, v]) => [norm(k), v.map(norm)]),
);

const DISCARD_COLUMN_RE = /nikolas/i;

export interface CardTime { card: string; days: number }

export interface ColumnDwell {
  column: string;
  /** Nº de saídas medidas (pares de movimentos consecutivos). */
  n: number;
  avgDays: number;
  maxDays: number;
  minDays: number;
  /** Cards que mais demoraram nesta coluna. */
  slowest: CardTime[];
}

export interface ColumnDestinations {
  column: string;
  total: number;
  destinations: { to: string; count: number; pct: number; expected: boolean }[];
  /** true quando a coluna tem fluxo esperado mapeado. */
  mapped: boolean;
}

export interface KanbanFlowAnalytics {
  dwell: ColumnDwell[];
  destinations: ColumnDestinations[];
  rework: {
    totalReturns: number;
    cardsWithReturn: number;
    /** Colunas que mais RECEBEM cards de volta. */
    byColumn: { column: string; count: number }[];
    /** Amostra dos retornos (de onde saiu → pra onde voltou). */
    samples: { card: string; from: string; backTo: string; at: string }[];
  };
  discard: { column: string; passed: number; discarded: number; pct: number }[];
  totalTime: {
    count: number;
    avgDays: number | null;
    slowest: CardTime[];
    fastest: CardTime[];
  };
  totalMoves: number;
}

export async function getKanbanFlowAnalytics(fromISO: string, toISO: string): Promise<KanbanFlowAnalytics> {
  await requireTeam();

  const logs = await db.log.findMany({
    where: { action: "move", createdAt: { gte: new Date(fromISO), lte: new Date(toISO) } },
    select: { userId: true, processId: true, metadata: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: 20_000,
  });

  type CardMove = { from: string | null; to: string; at: Date; card: string };
  const byCard = new Map<string, CardMove[]>();
  for (const log of logs) {
    const meta = (log.metadata ?? {}) as MoveMeta & { cardName?: string | null };
    const to = typeof meta.to === "string" ? meta.to : null;
    if (!to) continue;
    const key = log.processId ? `p:${log.processId}` : log.userId ? `u:${log.userId}` : null;
    if (!key) continue;
    const list = byCard.get(key) ?? [];
    list.push({
      from: typeof meta.from === "string" ? meta.from : null,
      to,
      at: log.createdAt,
      card: (typeof meta.cardName === "string" && meta.cardName) || key,
    });
    byCard.set(key, list);
  }

  // ---- Tempo por coluna + destinos + retornos + descarte --------------------
  const dwellAgg = new Map<string, { totalMs: number; n: number; maxMs: number; minMs: number; slow: { card: string; ms: number }[] }>();
  const destAgg = new Map<string, Map<string, number>>();
  const returnsByColumn = new Map<string, number>();
  const returnSamples: KanbanFlowAnalytics["rework"]["samples"] = [];
  let totalReturns = 0;
  let cardsWithReturn = 0;
  // Descarte: por coluna de ORIGEM, quantos movimentos saíram dela no total e
  // quantos foram pro "Nikolas Analisar".
  const passAgg = new Map<string, { passed: number; discarded: number }>();
  const spans: CardTime[] = [];

  for (const moves of byCard.values()) {
    const visited = new Set<string>();
    let hadReturn = false;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const fromCol = m.from ?? moves[i - 1]?.to ?? null;

      // Destinos por coluna de origem
      if (fromCol) {
        const dests = destAgg.get(fromCol) ?? new Map<string, number>();
        dests.set(m.to, (dests.get(m.to) ?? 0) + 1);
        destAgg.set(fromCol, dests);

        const p = passAgg.get(fromCol) ?? { passed: 0, discarded: 0 };
        p.passed += 1;
        if (DISCARD_COLUMN_RE.test(m.to)) p.discarded += 1;
        passAgg.set(fromCol, p);
      }

      // Retorno: voltou pra uma coluna onde o card já esteve no período.
      if (visited.has(norm(m.to))) {
        totalReturns += 1;
        hadReturn = true;
        returnsByColumn.set(m.to, (returnsByColumn.get(m.to) ?? 0) + 1);
        if (returnSamples.length < 40) {
          returnSamples.push({ card: m.card, from: fromCol ?? "?", backTo: m.to, at: m.at.toISOString() });
        }
      }
      if (fromCol) visited.add(norm(fromCol));
      visited.add(norm(m.to));

      // Dwell: tempo entre este movimento e o próximo (na coluna m.to).
      const next = moves[i + 1];
      if (next) {
        const ms = next.at.getTime() - m.at.getTime();
        if (ms > 0) {
          const d = dwellAgg.get(m.to) ?? { totalMs: 0, n: 0, maxMs: 0, minMs: Infinity, slow: [] };
          d.totalMs += ms;
          d.n += 1;
          d.maxMs = Math.max(d.maxMs, ms);
          d.minMs = Math.min(d.minMs, ms);
          d.slow.push({ card: m.card, ms });
          dwellAgg.set(m.to, d);
        }
      }
    }
    if (hadReturn) cardsWithReturn += 1;

    // Tempo total no board (janela do período): 1º ao último movimento.
    if (moves.length >= 2) {
      const ms = moves[moves.length - 1].at.getTime() - moves[0].at.getTime();
      if (ms > 0) spans.push({ card: moves[0].card, days: round1(ms / 86_400_000) });
    }
  }

  const dwell: ColumnDwell[] = [...dwellAgg.entries()]
    .map(([column, d]) => ({
      column,
      n: d.n,
      avgDays: round1(d.totalMs / d.n / 86_400_000),
      maxDays: round1(d.maxMs / 86_400_000),
      minDays: round1(d.minMs / 86_400_000),
      slowest: d.slow.sort((a, b) => b.ms - a.ms).slice(0, 5)
        .map((s) => ({ card: s.card, days: round1(s.ms / 86_400_000) })),
    }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 25);

  const destinations: ColumnDestinations[] = [...destAgg.entries()]
    .map(([column, dests]) => {
      const total = [...dests.values()].reduce((a, b) => a + b, 0);
      const expectedList = EXPECTED_FLOWS[norm(column)];
      return {
        column,
        total,
        mapped: !!expectedList,
        destinations: [...dests.entries()]
          .map(([to, count]) => ({
            to,
            count,
            pct: Math.round((count / total) * 100),
            expected: expectedList ? expectedList.includes(norm(to)) : true,
          }))
          .sort((a, b) => b.count - a.count),
      };
    })
    // Colunas com fluxo mapeado primeiro, NA ORDEM do fluxo esperado
    // (Colher Assinatura → … → Distribuição de Processos); as demais por volume.
    .sort((a, b) => {
      const order = Object.keys(EXPECTED_FLOWS);
      const ia = order.indexOf(norm(a.column));
      const ib = order.indexOf(norm(b.column));
      if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      return b.total - a.total;
    })
    .slice(0, 25);

  const discard = [...passAgg.entries()]
    .filter(([, p]) => p.discarded > 0)
    .map(([column, p]) => ({
      column,
      passed: p.passed,
      discarded: p.discarded,
      pct: Math.round((p.discarded / p.passed) * 100),
    }))
    .sort((a, b) => b.pct - a.pct);

  spans.sort((a, b) => b.days - a.days);
  const totalTime = {
    count: spans.length,
    avgDays: spans.length ? round1(spans.reduce((a, s) => a + s.days, 0) / spans.length) : null,
    slowest: spans.slice(0, 10),
    fastest: [...spans].reverse().slice(0, 10),
  };

  return {
    dwell,
    destinations,
    rework: {
      totalReturns,
      cardsWithReturn,
      byColumn: [...returnsByColumn.entries()]
        .map(([column, count]) => ({ column, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
      samples: returnSamples,
    },
    discard,
    totalTime,
    totalMoves: logs.length,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ============ Meta mensal ============

export interface MonthGoal {
  month: string; // YYYY-MM
  target: number | null;
}

export async function getMonthGoal(month: string): Promise<MonthGoal> {
  await requireTeam();
  const goal = await db.goal.findUnique({
    where: { month_metric: { month, metric: "contratos" } },
    select: { target: true },
  });
  return { month, target: goal?.target ?? null };
}

/** Define a meta de contratos do mês — restrito a quem tem a Visão do Gestor. */
export async function setMonthGoal(month: string, target: number): Promise<MonthGoal> {
  await requirePermission("manager_dashboard");
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Mês inválido (use YYYY-MM).");
  const value = Math.max(0, Math.floor(target));
  await db.goal.upsert({
    where: { month_metric: { month, metric: "contratos" } },
    update: { target: value },
    create: { month, metric: "contratos", target: value },
  });
  return { month, target: value };
}

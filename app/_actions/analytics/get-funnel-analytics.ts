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

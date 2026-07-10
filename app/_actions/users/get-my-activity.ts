"use server";

import { db } from "../../_shared/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../_shared/lib/auth";

export interface ActivityItem {
  id: string;
  action: string;
  message: string;
  targetName: string | null;
  isProcess: boolean;
  createdAt: string;
}

export interface MyActivity {
  totals: { today: number; week: number; month: number; all: number };
  byAction: Record<string, number>;
  daily: { date: string; label: string; count: number }[];
  feed: ActivityItem[];
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Estatísticas de atividade do PRÓPRIO usuário logado, derivadas dos logs
 * (`Log.authorId`). Alimenta a aba "Meu Espaço": produtividade + feed.
 *
 * Segurança: opera exclusivamente sobre `session.user.id` como autor — o
 * usuário só vê a própria atividade.
 */
export async function getMyActivity(): Promise<MyActivity> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Não autenticado.");
  const authorId = session.user.id;

  const now = new Date();
  const today = startOfDay(now);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6); // 7 dias incluindo hoje
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 29);
  // Janela máxima de análise: 90 dias (as métricas "resetam" a cada 90 dias).
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - 89);
  const chartStart = new Date(today);
  chartStart.setDate(chartStart.getDate() - 13); // últimos 14 dias

  const [allCount, todayCount, weekCount, monthCount, grouped, chartLogs, feedRows] =
    await Promise.all([
      db.log.count({ where: { authorId, createdAt: { gte: windowStart } } }),
      db.log.count({ where: { authorId, createdAt: { gte: today } } }),
      db.log.count({ where: { authorId, createdAt: { gte: weekAgo } } }),
      db.log.count({ where: { authorId, createdAt: { gte: monthAgo } } }),
      db.log.groupBy({
        by: ["action"],
        where: { authorId, createdAt: { gte: monthAgo } },
        _count: { action: true },
      }),
      db.log.findMany({
        where: { authorId, createdAt: { gte: chartStart } },
        select: { createdAt: true },
      }),
      db.log.findMany({
        where: { authorId, createdAt: { gte: windowStart } },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          id: true,
          action: true,
          message: true,
          createdAt: true,
          processId: true,
          user: { select: { name: true } },
          process: { select: { name: true } },
        },
      }),
    ]);

  const byAction: Record<string, number> = {};
  for (const g of grouped) byAction[g.action] = g._count.action;

  // Bucket diário dos últimos 14 dias (preenche dias sem atividade com 0).
  const buckets = new Map<string, number>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(chartStart);
    d.setDate(d.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const l of chartLogs) {
    const key = startOfDay(l.createdAt).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const daily = Array.from(buckets.entries()).map(([date, count]) => ({
    date,
    label: new Date(date + "T12:00:00").toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    }),
    count,
  }));

  const feed: ActivityItem[] = feedRows.map((l) => ({
    id: l.id,
    action: l.action,
    message: l.message,
    targetName: l.process?.name ?? l.user?.name ?? null,
    isProcess: !!l.processId,
    createdAt: l.createdAt.toISOString(),
  }));

  return {
    totals: { today: todayCount, week: weekCount, month: monthCount, all: allCount },
    byAction,
    daily,
    feed,
  };
}

'use server';

import { db } from '@/app/_shared/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { isManager } from '@/app/_shared/lib/managers';

const ONLINE_WINDOW_MS = 90_000;

export interface CollaboratorDetail {
  profile: {
    id: string;
    name: string;
    image: string | null;
    role: string;
    email: string | null;
    online: boolean;
    lastSeenAt: string | null;
  };
  periodDays: number;
  totals: { today: number; week: number; month: number; period: number; allTime: number };
  byAction: Record<string, number>;
  daily: { date: string; label: string; count: number }[];
  hourly: number[];   // 24 posições (hora local Brasília)
  weekday: number[];  // 7 posições (0=Dom..6=Sáb)
  feed: { id: string; action: string; message: string; targetName: string | null; createdAt: string }[];
  team: { rank: number; totalCollaborators: number; sharePct: number; periodTotal: number };
}

// Extrai (weekday, hour) no fuso de Brasília sem libs externas.
const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'short',
  hour: '2-digit',
  hour12: false,
});
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function localBucket(date: Date): { day: number; hour: number } {
  const parts = partsFmt.formatToParts(date);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  let hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  if (hh === 24) hh = 0;
  return { day: WEEKDAY_INDEX[wd] ?? 0, hour: hh };
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Métricas detalhadas de UM colaborador (drill-down da Visão do Gestor).
 * Restrito a gestores. Deriva tudo da tabela Log (authorId = quem agiu).
 */
export async function getCollaboratorDetail(
  userId: string,
  periodDays: 7 | 30 | 90 = 30,
): Promise<CollaboratorDetail> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Não autenticado.');
  if (!isManager(session.user.email)) throw new Error('Acesso restrito a gestores.');

  const now = new Date();
  const today = startOfDay(now);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 6);
  const monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate() - 29);
  const periodStart = new Date(today); periodStart.setDate(periodStart.getDate() - (periodDays - 1));

  const [
    user, allTime, todayC, weekC, monthC, grouped, periodLogs, feedRows, teamGrouped,
  ] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, image: true, role: true, email: true, lastSeenAt: true } }),
    db.log.count({ where: { authorId: userId } }),
    db.log.count({ where: { authorId: userId, createdAt: { gte: today } } }),
    db.log.count({ where: { authorId: userId, createdAt: { gte: weekAgo } } }),
    db.log.count({ where: { authorId: userId, createdAt: { gte: monthAgo } } }),
    db.log.groupBy({ by: ['action'], where: { authorId: userId, createdAt: { gte: periodStart } }, _count: { _all: true } }),
    db.log.findMany({ where: { authorId: userId, createdAt: { gte: periodStart } }, select: { createdAt: true } }),
    db.log.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: { id: true, action: true, message: true, createdAt: true, processId: true, user: { select: { name: true } }, process: { select: { name: true } } },
    }),
    db.log.groupBy({ by: ['authorId'], where: { createdAt: { gte: periodStart } }, _count: { _all: true } }),
  ]);

  if (!user) throw new Error('Colaborador não encontrado.');

  const byAction: Record<string, number> = {};
  for (const g of grouped) byAction[g.action] = g._count._all;

  // Série diária.
  const buckets = new Map<string, number>();
  for (let i = 0; i < periodDays; i++) {
    const d = new Date(periodStart); d.setDate(d.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  const hourly = new Array(24).fill(0);
  const weekday = new Array(7).fill(0);
  for (const l of periodLogs) {
    const key = startOfDay(l.createdAt).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    const { day, hour } = localBucket(l.createdAt);
    hourly[hour] += 1;
    weekday[day] += 1;
  }
  const daily = Array.from(buckets.entries()).map(([date, count]) => ({
    date,
    label: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    count,
  }));

  const feed = feedRows.map((l) => ({
    id: l.id,
    action: l.action,
    message: l.message,
    targetName: l.process?.name ?? l.user?.name ?? null,
    createdAt: l.createdAt.toISOString(),
  }));

  // Posição no ranking do período + fatia do total da equipe.
  const sorted = [...teamGrouped].sort((a, b) => b._count._all - a._count._all);
  const rank = sorted.findIndex((g) => g.authorId === userId) + 1;
  const periodTotal = sorted.reduce((s, g) => s + g._count._all, 0);
  const mine = sorted.find((g) => g.authorId === userId)?._count._all ?? 0;
  const sharePct = periodTotal > 0 ? Math.round((mine / periodTotal) * 100) : 0;

  const online = !!user.lastSeenAt && Date.now() - new Date(user.lastSeenAt).getTime() < ONLINE_WINDOW_MS;

  return {
    profile: {
      id: user.id,
      name: user.name ?? 'Usuário',
      image: user.image,
      role: user.role,
      email: user.email,
      online,
      lastSeenAt: user.lastSeenAt ? user.lastSeenAt.toISOString() : null,
    },
    periodDays,
    totals: { today: todayC, week: weekC, month: monthC, period: mine, allTime },
    byAction,
    daily,
    hourly,
    weekday,
    feed,
    team: { rank: rank || sorted.length + 1, totalCollaborators: sorted.length, sharePct, periodTotal },
  };
}

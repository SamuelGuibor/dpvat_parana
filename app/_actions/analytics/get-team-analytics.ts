'use server';

import { db } from '@/app/_shared/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { isManager } from '@/app/_shared/lib/managers';

// Mesma janela do heartbeat de presença (api/presence/route.ts).
const ONLINE_WINDOW_MS = 90_000;

export interface RankingEntry {
  id: string;
  name: string;
  image: string | null;
  total: number;
  byAction: Record<string, number>;
}

export interface TeamAnalytics {
  periodDays: number;
  ranking: RankingEntry[];
  // heatmap[diaDaSemana 0=Dom..6=Sáb][hora 0..23] = nº de ações
  heatmap: number[][];
  totals: { logs: number; activeCollaborators: number; onlineNow: number };
}

// Extrai (diaDaSemana, hora) no fuso America/Sao_Paulo sem libs externas.
const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  weekday: 'short',
  hour: '2-digit',
  hour12: false,
});
const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function localBucket(date: Date): { day: number; hour: number } {
  const parts = partsFmt.formatToParts(date);
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Sun';
  let hh = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  if (hh === 24) hh = 0; // hour12:false pode devolver "24" à meia-noite
  return { day: WEEKDAY_INDEX[wd] ?? 0, hour: hh };
}

/**
 * Métricas agregadas da equipe (Visão do Gestor). Restrito a gestores.
 * Deriva tudo da tabela Log (campo authorId = quem executou a ação).
 */
export async function getTeamAnalytics(periodDays: 7 | 30 = 7): Promise<TeamAnalytics> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Não autenticado.');
  if (!isManager(session.user.email)) throw new Error('Acesso restrito a gestores.');

  const since = new Date();
  since.setDate(since.getDate() - (periodDays - 1));
  since.setHours(0, 0, 0, 0);

  const [byAuthor, byAuthorAction, heatmapLogs, users] = await Promise.all([
    db.log.groupBy({ by: ['authorId'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.log.groupBy({ by: ['authorId', 'action'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
    db.log.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
    db.user.findMany({
      where: { role: { in: ['ADMIN', 'ADMIN+', 'ADMIN++'] } },
      select: { id: true, name: true, image: true, lastSeenAt: true },
    }),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));

  // Breakdown por autor/ação.
  const breakdown = new Map<string, Record<string, number>>();
  for (const row of byAuthorAction) {
    const m = breakdown.get(row.authorId) ?? {};
    m[row.action] = row._count._all;
    breakdown.set(row.authorId, m);
  }

  const ranking: RankingEntry[] = byAuthor
    .map((row) => {
      const u = userMap.get(row.authorId);
      return {
        id: row.authorId,
        name: u?.name ?? 'Usuário',
        image: u?.image ?? null,
        total: row._count._all,
        byAction: breakdown.get(row.authorId) ?? {},
      };
    })
    .sort((a, b) => b.total - a.total);

  // Heatmap 7x24.
  const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const l of heatmapLogs) {
    const { day, hour } = localBucket(l.createdAt);
    heatmap[day][hour] += 1;
  }

  const now = Date.now();
  const onlineNow = users.filter(
    (u) => u.lastSeenAt && now - new Date(u.lastSeenAt).getTime() < ONLINE_WINDOW_MS,
  ).length;

  return {
    periodDays,
    ranking,
    heatmap,
    totals: {
      logs: heatmapLogs.length,
      activeCollaborators: ranking.length,
      onlineNow,
    },
  };
}

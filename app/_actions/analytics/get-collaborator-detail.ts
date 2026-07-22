'use server';

import { db } from '@/app/_shared/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { getSessionPermissions } from '@/app/_shared/lib/permissions-server';
import { DEV_COMMIT_ACTION, devCommitFiles, devFilesDelta, devFilesTotal } from '@/app/_shared/lib/dev-activity';

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
  // allTime = janela máxima de 90 dias (reseta a cada 90 dias)
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
  const perms = await getSessionPermissions();
  if (!perms?.permissions.manager_dashboard) throw new Error('Acesso restrito a gestores.');

  const now = new Date();
  const today = startOfDay(now);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 6);
  const monthAgo = new Date(today); monthAgo.setDate(monthAgo.getDate() - 29);
  // Janela máxima de análise: 90 dias (as métricas "resetam" a cada 90 dias).
  const windowStart = new Date(today); windowStart.setDate(windowStart.getDate() - 89);
  const periodStart = new Date(today); periodStart.setDate(periodStart.getDate() - (periodDays - 1));

  const [
    user, allTime, todayC, weekC, monthC, grouped, periodLogs, feedRows, teamGrouped, teamMembers,
  ] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, image: true, role: true, email: true, lastSeenAt: true } }),
    db.log.count({ where: { authorId: userId, createdAt: { gte: windowStart } } }),
    db.log.count({ where: { authorId: userId, createdAt: { gte: today } } }),
    db.log.count({ where: { authorId: userId, createdAt: { gte: weekAgo } } }),
    db.log.count({ where: { authorId: userId, createdAt: { gte: monthAgo } } }),
    db.log.groupBy({ by: ['action'], where: { authorId: userId, createdAt: { gte: periodStart } }, _count: { _all: true } }),
    db.log.findMany({ where: { authorId: userId, createdAt: { gte: periodStart } }, select: { createdAt: true, action: true, metadata: true } }),
    // Feed com TODOS os logs do filtro ativo (7/30/90 dias) — a UI rola.
    db.log.findMany({
      where: { authorId: userId, createdAt: { gte: periodStart } },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: { id: true, action: true, message: true, createdAt: true, processId: true, user: { select: { name: true } }, process: { select: { name: true } } },
    }),
    db.log.groupBy({ by: ['authorId'], where: { createdAt: { gte: periodStart } }, _count: { _all: true } }),
    // Equipe atual: usada para excluir do ranking quem foi demitido (deletado)
    // ou autores não-humanos (ex.: "whatsapp-bot").
    db.user.findMany({ where: { role: { in: ['ADMIN', 'ADMIN+', 'ADMIN++'] } }, select: { id: true } }),
  ]);

  if (!user) throw new Error('Colaborador não encontrado.');

  const teamIdSet = new Set(teamMembers.map((u) => u.id));

  // Logs de desenvolvimento do colaborador (janela máx) — pontuam por ARQUIVOS.
  const myDevLogs = await db.log.findMany({
    where: { authorId: userId, action: DEV_COMMIT_ACTION, createdAt: { gte: windowStart } },
    select: { createdAt: true, metadata: true },
  });
  // Delta (Σ arquivos − nº commits) para cada janela — desde `from` até agora.
  const devDelta = (from: Date) => devFilesDelta(myDevLogs.filter((l) => l.createdAt >= from));

  const byAction: Record<string, number> = {};
  for (const g of grouped) byAction[g.action] = g._count._all;
  // Desenvolvimento no breakdown = arquivos (não nº de commits).
  const devFilesPeriod = devFilesTotal(myDevLogs.filter((l) => l.createdAt >= periodStart));
  if (devFilesPeriod > 0) byAction[DEV_COMMIT_ACTION] = devFilesPeriod;

  // Série diária (dev pesa por arquivos; demais ações, 1 cada).
  const buckets = new Map<string, number>();
  for (let i = 0; i < periodDays; i++) {
    const d = new Date(periodStart); d.setDate(d.getDate() + i);
    buckets.set(d.toISOString().slice(0, 10), 0);
  }
  const hourly = new Array(24).fill(0);
  const weekday = new Array(7).fill(0);
  for (const l of periodLogs) {
    const weight = l.action === DEV_COMMIT_ACTION ? devCommitFiles(l.metadata) : 1;
    const key = startOfDay(l.createdAt).toISOString().slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + weight);
    const { day, hour } = localBucket(l.createdAt);
    hourly[hour] += weight;
    weekday[day] += weight;
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

  // Posição no ranking do período + fatia do total da equipe. Dev pesa por
  // arquivos, então aplicamos o delta de cada autor à contagem crua antes de
  // ordenar (consistente com o ranking da Visão do Gestor).
  const teamDevLogs = await db.log.findMany({
    where: { action: DEV_COMMIT_ACTION, createdAt: { gte: periodStart } },
    select: { authorId: true, metadata: true },
  });
  const teamDevDelta = new Map<string, number>();
  for (const l of teamDevLogs) {
    teamDevDelta.set(l.authorId, (teamDevDelta.get(l.authorId) ?? 0) + devCommitFiles(l.metadata) - 1);
  }
  const weighted = teamGrouped
    .filter((g) => teamIdSet.has(g.authorId)) // exclui demitidos/bot do ranking
    .map((g) => ({ authorId: g.authorId, total: g._count._all + (teamDevDelta.get(g.authorId) ?? 0) }))
    .sort((a, b) => b.total - a.total);
  const rank = weighted.findIndex((g) => g.authorId === userId) + 1;
  const periodTotal = weighted.reduce((s, g) => s + g.total, 0);
  const mine = weighted.find((g) => g.authorId === userId)?.total ?? 0;
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
    totals: {
      today: todayC + devDelta(today),
      week: weekC + devDelta(weekAgo),
      month: monthC + devDelta(monthAgo),
      period: mine, // já ponderado no ranking acima
      allTime: allTime + devDelta(windowStart),
    },
    byAction,
    daily,
    hourly,
    weekday,
    feed,
    team: { rank: rank || weighted.length + 1, totalCollaborators: weighted.length, sharePct, periodTotal },
  };
}

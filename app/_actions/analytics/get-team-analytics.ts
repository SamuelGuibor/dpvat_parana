'use server';

import { db } from '@/app/_shared/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { isManager } from '@/app/_shared/lib/managers';
import { DEV_COMMIT_ACTION, devCommitFiles } from '@/app/_shared/lib/dev-activity';

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
  ranking: RankingEntry[];
  // heatmap[diaDaSemana 0=Dom..6=Sáb][hora 0..23] = nº de ações
  heatmap: number[][];
  totals: { logs: number; activeCollaborators: number; onlineNow: number };
}

/** Intervalo de datas (ISO) escolhido no filtro — mesmo formato do DateFilter. */
export interface DateRangeInput {
  from: string;
  to: string;
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
export async function getTeamAnalytics(range: DateRangeInput): Promise<TeamAnalytics> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Não autenticado.');
  if (!isManager(session.user.email)) throw new Error('Acesso restrito a gestores.');

  const from = new Date(range.from);
  const to = new Date(range.to);

  // Só colaboradores ATUAIS entram nas métricas do Gestor. Se alguém foi
  // demitido (usuário deletado), os logs dele continuam no banco — e no
  // histórico dos cards — mas somem daqui. Filtramos os logs por autor ∈ equipe
  // atual (isso também exclui autores não-humanos, ex.: "whatsapp-bot").
  const users = await db.user.findMany({
    where: { role: { in: ['ADMIN', 'ADMIN+', 'ADMIN++'] } },
    select: { id: true, name: true, image: true, lastSeenAt: true },
  });
  const teamIds = users.map((u) => u.id);
  const scoped = { createdAt: { gte: from, lte: to }, authorId: { in: teamIds } };

  const [byAuthor, byAuthorAction, heatmapLogs, devLogs] = await Promise.all([
    db.log.groupBy({ by: ['authorId'], where: scoped, _count: { _all: true } }),
    db.log.groupBy({ by: ['authorId', 'action'], where: scoped, _count: { _all: true } }),
    db.log.findMany({ where: scoped, select: { createdAt: true } }),
    // Logs de desenvolvimento: pontuam por ARQUIVOS (metadata.files), não por
    // 1 por commit. Buscamos à parte para aplicar o peso (ver dev-activity.ts).
    db.log.findMany({ where: { ...scoped, action: DEV_COMMIT_ACTION }, select: { authorId: true, metadata: true } }),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u]));

  // Peso de dev por autor: nº de arquivos somados e quantos commits (para trocar
  // "1 por commit" já contado em byAuthor pelo total de arquivos).
  const devByAuthor = new Map<string, { commits: number; files: number }>();
  for (const l of devLogs) {
    const cur = devByAuthor.get(l.authorId) ?? { commits: 0, files: 0 };
    cur.commits += 1;
    cur.files += devCommitFiles(l.metadata);
    devByAuthor.set(l.authorId, cur);
  }

  // Breakdown por autor/ação.
  const breakdown = new Map<string, Record<string, number>>();
  for (const row of byAuthorAction) {
    const m = breakdown.get(row.authorId) ?? {};
    m[row.action] = row._count._all;
    breakdown.set(row.authorId, m);
  }
  // Desenvolvimento no breakdown = arquivos (não nº de commits).
  for (const [authorId, dev] of devByAuthor) {
    const m = breakdown.get(authorId) ?? {};
    m[DEV_COMMIT_ACTION] = dev.files;
    breakdown.set(authorId, m);
  }

  const ranking: RankingEntry[] = byAuthor
    .map((row) => {
      const u = userMap.get(row.authorId);
      const dev = devByAuthor.get(row.authorId);
      // Troca o "1 por commit" (já somado em _all) pelo nº de arquivos.
      const total = row._count._all + (dev ? dev.files - dev.commits : 0);
      return {
        id: row.authorId,
        name: u?.name ?? 'Usuário',
        image: u?.image ?? null,
        total,
        byAction: breakdown.get(row.authorId) ?? {},
      };
    })
    .sort((a, b) => b.total - a.total);

  // Total de ações da equipe também reflete o peso de dev (arquivos).
  const devTotalDelta = [...devByAuthor.values()].reduce((s, d) => s + d.files - d.commits, 0);

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
    ranking,
    heatmap,
    totals: {
      logs: heatmapLogs.length + devTotalDelta,
      activeCollaborators: ranking.length,
      onlineNow,
    },
  };
}

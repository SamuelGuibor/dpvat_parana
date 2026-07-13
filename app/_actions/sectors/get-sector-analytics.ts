"use server";

import { db } from "@/app/_shared/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/_shared/lib/auth";

export interface SectorMemberStats {
  id: string;
  name: string;
  image: string | null;
  total: number;
  byAction: Record<string, number>;
}

export interface SectorStats {
  id: string;
  name: string;
  slug: string;
  color: string;
  memberCount: number;
  /** Membros com pelo menos 1 ação no período. */
  activeMembers: number;
  /** Total de ações do setor no período. */
  total: number;
  /** Média de ações por membro (1 casa decimal). */
  perMember: number;
  byAction: Record<string, number>;
  /** Ações por dia (índice 0 = dia mais antigo do período). */
  daily: number[];
  /** Membros ordenados do maior para o menor rendimento. */
  members: SectorMemberStats[];
}

export interface SectorAnalytics {
  /** Nº de dias do intervalo selecionado (para rótulos e média/dia). */
  rangeDays: number;
  /** Rótulos "dd/MM" de cada ponto da série (mesmo índice de `daily`). */
  dayLabels: string[];
  sectors: SectorStats[];
  /** Equipe sem setor atribuído (com as mesmas métricas individuais). */
  unassigned: SectorMemberStats[];
  totals: { actions: number; assigned: number; unassigned: number };
}

/** Intervalo de datas (ISO) escolhido no filtro — mesmo formato do DateFilter. */
export interface DateRangeInput {
  from: string;
  to: string;
}

const TEAM_ROLES = ["ADMIN", "ADMIN+", "ADMIN++"];
const DAY_MS = 86_400_000;

// Bucket diário no fuso de Brasília (mesmo critério do heatmap do Gestor).
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
});
const dayLabelFmt = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
});

/**
 * Rendimento por setor com detalhe por pessoa: totais, breakdown por tipo de
 * ação (tabela Log), série diária para tendência e ranking interno de membros.
 * Qualquer usuário autenticado pode consultar (métrica de equipe).
 */
export async function getSectorAnalytics(range: DateRangeInput): Promise<SectorAnalytics> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Não autenticado.");

  const from = new Date(range.from);
  const to = new Date(range.to);
  const rangeDays = Math.max(1, Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1);

  // Série da tendência: 1 ponto por dia, mas agrupando dias em intervalos longos
  // para manter no máx. ~90 pontos (ex.: "este ano" vira ~90 pontos semanais).
  const bucketSize = Math.max(1, Math.ceil(rangeDays / 90));
  const dayLabels: string[] = [];
  const dayIndex = new Map<string, number>(); // dayKey (Brasília) -> índice do ponto
  for (let i = 0; i < rangeDays; i++) {
    const d = new Date(from.getTime() + i * DAY_MS);
    const bucket = Math.floor(i / bucketSize);
    dayIndex.set(dayKeyFmt.format(d), bucket);
    if (i % bucketSize === 0) dayLabels.push(dayLabelFmt.format(d)); // rótulo = 1º dia do ponto
  }
  const points = dayLabels.length;

  const [sectors, team] = await Promise.all([
    db.sector.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }] }),
    db.user.findMany({
      where: { role: { in: TEAM_ROLES } },
      select: { id: true, name: true, image: true, sectorId: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const logs = await db.log.findMany({
    where: { createdAt: { gte: from, lte: to }, authorId: { in: team.map((u) => u.id) } },
    select: { authorId: true, action: true, createdAt: true },
  });

  const userStats = new Map<string, { total: number; byAction: Record<string, number> }>();
  const sectorDaily = new Map<string, number[]>();
  for (const s of sectors) sectorDaily.set(s.id, new Array(points).fill(0));
  const sectorOf = new Map(team.map((u) => [u.id, u.sectorId]));

  let totalActions = 0;
  for (const log of logs) {
    const day = dayIndex.get(dayKeyFmt.format(log.createdAt));
    if (day === undefined) continue; // fora do período (borda da janela larga)

    totalActions += 1;
    const stats = userStats.get(log.authorId) ?? { total: 0, byAction: {} };
    stats.total += 1;
    stats.byAction[log.action] = (stats.byAction[log.action] ?? 0) + 1;
    userStats.set(log.authorId, stats);

    const sectorId = sectorOf.get(log.authorId);
    if (sectorId) {
      const daily = sectorDaily.get(sectorId);
      if (daily) daily[day] += 1;
    }
  }

  function memberStats(u: { id: string; name: string | null; image: string | null }): SectorMemberStats {
    const s = userStats.get(u.id);
    return {
      id: u.id,
      name: u.name ?? "Sem nome",
      image: u.image,
      total: s?.total ?? 0,
      byAction: s?.byAction ?? {},
    };
  }

  const sectorStats: SectorStats[] = sectors.map((s) => {
    const members = team.filter((u) => u.sectorId === s.id).map(memberStats)
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    const byAction: Record<string, number> = {};
    let total = 0;
    for (const m of members) {
      total += m.total;
      for (const [action, count] of Object.entries(m.byAction)) {
        byAction[action] = (byAction[action] ?? 0) + count;
      }
    }

    return {
      id: s.id,
      name: s.name,
      slug: s.slug,
      color: s.color,
      memberCount: members.length,
      activeMembers: members.filter((m) => m.total > 0).length,
      total,
      perMember: members.length ? Math.round((total / members.length) * 10) / 10 : 0,
      byAction,
      daily: sectorDaily.get(s.id) ?? new Array(points).fill(0),
      members,
    };
  });

  const unassigned = team.filter((u) => !u.sectorId).map(memberStats)
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  return {
    rangeDays,
    dayLabels,
    sectors: sectorStats,
    unassigned,
    totals: {
      actions: totalActions,
      assigned: team.length - unassigned.length,
      unassigned: unassigned.length,
    },
  };
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/_shared/lib/prisma';
import { getSessionPermissions } from '@/app/_shared/lib/permissions-server';
import { canManagePonto } from '@/app/_shared/lib/ponto-access';
import { brDayKey } from '@/app/_shared/utils/date-br';
import {
  dayEndMs,
  parseBreaks,
  parseSchedule,
  targetMinutes,
  workedMinutes,
  breakMinutes,
  fmtHm,
  fmtSigned,
  fmtClock,
  fmtDayLong,
  BREAK_LABEL,
  type PontoBreak,
  type PontoSession,
  type WorkSchedule,
} from '@/app/_shared/lib/ponto';

// O "dia" da jornada é o dia de Brasília, não o do servidor (UTC): das 21h em
// diante o ponto batido à noite caía no dia seguinte.
function todayStr() {
  return brDayKey();
}

function thisMonth() {
  return todayStr().slice(0, 7);
}

/** Valida "YYYY-MM" vindo da query — evita `startsWith` com lixo. */
function safeMonth(raw: string | null): string {
  return raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : thisMonth();
}

type DbSession = Awaited<ReturnType<typeof db.workSession.findFirst>>;

function toDto(ws: NonNullable<DbSession>): PontoSession {
  return {
    id: ws.id,
    userId: ws.userId,
    discordId: ws.discordId,
    date: ws.date,
    startedAt: ws.startedAt?.toISOString() ?? null,
    pausedAt: ws.pausedAt?.toISOString() ?? null,
    resumedAt: ws.resumedAt?.toISOString() ?? null,
    finishedAt: ws.finishedAt?.toISOString() ?? null,
    isActive: ws.isActive,
    isPaused: ws.isPaused,
    breaks: ws.breaks ?? null,
    note: ws.note,
    autoClosed: ws.autoClosed,
    editedById: ws.editedById,
    editedAt: ws.editedAt?.toISOString() ?? null,
  };
}

/**
 * Campos derivados que TODA escrita precisa manter em sincronia: a primeira
 * pausa espelhada no par legado e os flags de estado.
 */
function derived(breaks: PontoBreak[], finished: boolean) {
  const first = breaks[0] ?? null;
  const open = breaks.some((b) => !b.end);
  return {
    breaks: breaks as unknown as object[],
    pausedAt: first ? new Date(first.start) : null,
    resumedAt: first?.end ? new Date(first.end) : null,
    isPaused: !finished && open,
    isActive: !finished,
  };
}

/**
 * Turno que virou o dia aberto: o colaborador esqueceu de encerrar. Fecha na
 * virada do dia (23:59) e marca `autoClosed` para o gestor saber que aquele
 * horário não foi batido de verdade.
 */
async function closeStale(where: { discordId: string } | { discordId: { in: string[] } }) {
  const stale = await db.workSession.findMany({
    where: { ...where, isActive: true, date: { lt: todayStr() } },
    take: 50,
  });
  if (!stale.length) return;

  await Promise.all(
    stale.map((ws) => {
      const end = new Date(dayEndMs(ws.date));
      const breaks = parseBreaks(toDto(ws)).map((b) => (b.end ? b : { ...b, end: end.toISOString() }));
      return db.workSession.update({
        where: { id: ws.id },
        data: {
          ...derived(breaks, true),
          finishedAt: ws.finishedAt ?? end,
          autoClosed: true,
        },
      });
    }),
  );
}

/* ------------------------------------------------------------------ */
/* GET                                                                 */
/* ------------------------------------------------------------------ */

export async function GET(req: NextRequest) {
  const ctx = await getSessionPermissions();
  if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const all = searchParams.get('all') === 'true';
  const month = safeMonth(searchParams.get('month'));
  const canManage = canManagePonto(ctx.userId, ctx.permissions);

  if (all) {
    // A checagem que faltava: antes qualquer autenticado podia ler o ponto da
    // equipe inteira pela API, mesmo com o botão escondido na tela.
    if (!canManage) {
      return NextResponse.json({ error: 'Você não tem permissão para ver o ponto da equipe.' }, { status: 403 });
    }

    const team = await db.user.findMany({
      where: { role: { in: ['ADMIN', 'ADMIN+', 'ADMIN++'] } },
      select: { id: true, name: true, role: true, image: true, workSchedule: true },
    });
    await closeStale({ discordId: { in: team.map((u) => u.id) } });

    const sessions = await db.workSession.findMany({
      where: { date: { startsWith: month } },
      orderBy: { date: 'desc' },
    });

    const byUser = new Map<string, PontoSession[]>();
    for (const s of sessions) {
      const list = byUser.get(s.discordId) ?? [];
      list.push(toDto(s));
      byUser.set(s.discordId, list);
    }

    const members = team
      .filter((u) => u.name?.trim())
      .map((u) => ({
        user: { id: u.id, name: u.name, role: u.role, image: u.image },
        schedule: parseSchedule(u.workSchedule),
        sessions: byUser.get(u.id) ?? [],
      }))
      .sort((a, b) => (a.user.name ?? '').localeCompare(b.user.name ?? '', 'pt-BR'));

    if (searchParams.get('format') === 'csv') {
      return csvResponse(members, month);
    }

    return NextResponse.json({ month, today: todayStr(), members });
  }

  await closeStale({ discordId: ctx.userId });

  const me = await db.user.findUnique({
    where: { id: ctx.userId },
    select: { workSchedule: true },
  });

  const sessions = await db.workSession.findMany({
    where: { discordId: ctx.userId, date: { startsWith: month } },
    orderBy: { date: 'desc' },
  });

  const today = todayStr();
  const dtos = sessions.map(toDto);

  // O turno de hoje aparece mesmo quando o histórico está em outro mês.
  let todaySession = dtos.find((s) => s.date === today) ?? null;
  if (!todaySession && month !== thisMonth()) {
    const ws = await db.workSession.findFirst({ where: { discordId: ctx.userId, date: today } });
    todaySession = ws ? toDto(ws) : null;
  }

  return NextResponse.json({
    month,
    today,
    canManageTeam: canManage,
    schedule: parseSchedule(me?.workSchedule),
    todaySession,
    sessions: dtos,
  });
}

/* ------------------------------------------------------------------ */
/* POST — batidas do próprio usuário                                   */
/* ------------------------------------------------------------------ */

type Action = 'start' | 'pause' | 'resume' | 'finish' | 'reopen' | 'note';

export async function POST(req: NextRequest) {
  const ctx = await getSessionPermissions();
  if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const body = (await req.json()) as {
    action: Action;
    kind?: string;
    note?: string;
  };
  const { action } = body;
  const date = todayStr();
  const now = new Date();

  await closeStale({ discordId: ctx.userId });

  const existing = await db.workSession.findFirst({ where: { discordId: ctx.userId, date } });

  if (action === 'start') {
    if (existing?.startedAt) {
      return NextResponse.json(
        { error: existing.finishedAt ? 'Turno de hoje já encerrado — use "Reabrir turno".' : 'Turno já iniciado hoje.' },
        { status: 400 },
      );
    }
    const ws = await db.workSession.create({
      data: {
        userId: ctx.userId,
        discordId: ctx.userId,
        date,
        startedAt: now,
        isActive: true,
        isPaused: false,
        breaks: [],
      },
    });
    return NextResponse.json(toDto(ws));
  }

  if (!existing) return NextResponse.json({ error: 'Nenhum turno registrado hoje.' }, { status: 400 });

  const current = toDto(existing);
  const breaks = parseBreaks(current);

  if (action === 'note') {
    const ws = await db.workSession.update({
      where: { id: existing.id },
      data: { note: (body.note ?? '').trim().slice(0, 500) || null },
    });
    return NextResponse.json(toDto(ws));
  }

  if (action === 'pause') {
    if (existing.finishedAt) return NextResponse.json({ error: 'Turno já encerrado.' }, { status: 400 });
    if (breaks.some((b) => !b.end)) return NextResponse.json({ error: 'Já existe uma pausa em curso.' }, { status: 400 });
    const kind = body.kind === 'almoco' ? 'almoco' : 'pausa';
    const next = [...breaks, { start: now.toISOString(), end: null, kind } as PontoBreak];
    const ws = await db.workSession.update({ where: { id: existing.id }, data: derived(next, false) });
    return NextResponse.json(toDto(ws));
  }

  if (action === 'resume') {
    const openIdx = breaks.findIndex((b) => !b.end);
    if (openIdx < 0) return NextResponse.json({ error: 'Nenhuma pausa em curso.' }, { status: 400 });
    const next = breaks.map((b, i) => (i === openIdx ? { ...b, end: now.toISOString() } : b));
    const ws = await db.workSession.update({ where: { id: existing.id }, data: derived(next, false) });
    return NextResponse.json(toDto(ws));
  }

  if (action === 'finish') {
    if (existing.finishedAt) return NextResponse.json({ error: 'Turno já encerrado.' }, { status: 400 });
    // Encerrar durante a pausa fecha a pausa no mesmo instante — senão o
    // intervalo aberto engoliria o resto do dia no cálculo.
    const next = breaks.map((b) => (b.end ? b : { ...b, end: now.toISOString() }));
    const ws = await db.workSession.update({
      where: { id: existing.id },
      data: { ...derived(next, true), finishedAt: now },
    });
    return NextResponse.json(toDto(ws));
  }

  if (action === 'reopen') {
    if (!existing.finishedAt) return NextResponse.json({ error: 'O turno não está encerrado.' }, { status: 400 });
    const ws = await db.workSession.update({
      where: { id: existing.id },
      data: { ...derived(breaks, false), finishedAt: null, autoClosed: false },
    });
    return NextResponse.json(toDto(ws));
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}

/* ------------------------------------------------------------------ */
/* PATCH — correção manual (gestor)                                    */
/* ------------------------------------------------------------------ */

export async function PATCH(req: NextRequest) {
  const ctx = await getSessionPermissions();
  if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!canManagePonto(ctx.userId, ctx.permissions)) {
    return NextResponse.json({ error: 'Você não tem permissão para corrigir o ponto.' }, { status: 403 });
  }

  const body = (await req.json()) as {
    id?: string;
    userId?: string;
    date?: string;
    startedAt?: string | null;
    finishedAt?: string | null;
    breaks?: PontoBreak[];
    note?: string | null;
    /** Jornada esperada do colaborador — definida só por quem gerencia o ponto. */
    schedule?: { dailyMinutes?: number; days?: number[] };
  };

  // Configuração de jornada de um colaborador (sem mexer em batidas).
  if (body.schedule && body.userId) {
    const schedule = parseSchedule(body.schedule);
    await db.user.update({
      where: { id: body.userId },
      data: { workSchedule: { ...schedule } as unknown as object },
    });
    return NextResponse.json({ schedule });
  }

  const existing = body.id
    ? await db.workSession.findUnique({ where: { id: body.id } })
    : body.userId && body.date
      ? await db.workSession.findFirst({ where: { discordId: body.userId, date: body.date } })
      : null;

  const date = existing?.date ?? body.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Dia inválido.' }, { status: 400 });
  }

  const started = body.startedAt ? new Date(body.startedAt) : null;
  const finished = body.finishedAt ? new Date(body.finishedAt) : null;
  if (body.startedAt && Number.isNaN(started!.getTime())) {
    return NextResponse.json({ error: 'Horário de entrada inválido.' }, { status: 400 });
  }
  if (body.finishedAt && Number.isNaN(finished!.getTime())) {
    return NextResponse.json({ error: 'Horário de saída inválido.' }, { status: 400 });
  }
  if (started && finished && finished <= started) {
    return NextResponse.json({ error: 'A saída precisa ser depois da entrada.' }, { status: 400 });
  }

  const breaks = (body.breaks ?? [])
    .filter((b) => b?.start && !Number.isNaN(new Date(b.start).getTime()))
    .map((b) => ({
      start: new Date(b.start).toISOString(),
      end: b.end && !Number.isNaN(new Date(b.end).getTime()) ? new Date(b.end).toISOString() : null,
      kind: b.kind === 'almoco' ? ('almoco' as const) : ('pausa' as const),
    }))
    .sort((a, b) => a.start.localeCompare(b.start));

  for (const b of breaks) {
    if (b.end && b.end <= b.start) {
      return NextResponse.json({ error: 'Toda pausa precisa terminar depois de começar.' }, { status: 400 });
    }
    if (started && b.start < started.toISOString()) {
      return NextResponse.json({ error: 'Há pausa antes da entrada.' }, { status: 400 });
    }
    if (finished && b.end && b.end > finished.toISOString()) {
      return NextResponse.json({ error: 'Há pausa depois da saída.' }, { status: 400 });
    }
  }

  const data = {
    ...derived(breaks, !!finished),
    startedAt: started,
    finishedAt: finished,
    note: (body.note ?? '').trim().slice(0, 500) || null,
    editedById: ctx.userId,
    editedAt: new Date(),
    autoClosed: false,
  };

  const targetUserId = existing?.discordId ?? body.userId;
  if (!targetUserId) return NextResponse.json({ error: 'Colaborador não informado.' }, { status: 400 });

  const ws = existing
    ? await db.workSession.update({ where: { id: existing.id }, data })
    : await db.workSession.create({ data: { ...data, userId: targetUserId, discordId: targetUserId, date } });

  return NextResponse.json(toDto(ws));
}

/* ------------------------------------------------------------------ */
/* DELETE — apaga um dia lançado por engano (gestor)                   */
/* ------------------------------------------------------------------ */

export async function DELETE(req: NextRequest) {
  const ctx = await getSessionPermissions();
  if (!ctx) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  if (!canManagePonto(ctx.userId, ctx.permissions)) {
    return NextResponse.json({ error: 'Você não tem permissão para corrigir o ponto.' }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Registro não informado.' }, { status: 400 });

  await db.workSession.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

interface Member {
  user: { id: string; name: string | null; role: string; image: string | null };
  schedule: WorkSchedule;
  sessions: PontoSession[];
}

function csvCell(v: string) {
  return /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function csvResponse(members: Member[], month: string) {
  const head = [
    'Colaborador', 'Data', 'Dia', 'Entrada', 'Saída',
    'Pausas', 'Tempo em pausa', 'Trabalhado', 'Meta', 'Saldo', 'Observação',
  ];
  const rows: string[][] = [];

  for (const m of members) {
    for (const s of [...m.sessions].sort((a, b) => a.date.localeCompare(b.date))) {
      if (!s.startedAt) continue;
      const worked = workedMinutes(s);
      const target = targetMinutes(s.date, m.schedule);
      const pausesLabel = parseBreaks(s)
        .map((b) => `${BREAK_LABEL[b.kind]} ${fmtClock(b.start)}–${fmtClock(b.end)}`)
        .join(' | ');
      const flags = [
        s.autoClosed ? 'encerrado automaticamente' : '',
        s.editedById ? 'corrigido manualmente' : '',
        s.note ?? '',
      ].filter(Boolean).join(' — ');

      rows.push([
        m.user.name ?? m.user.id,
        s.date,
        fmtDayLong(s.date).split(',')[0],
        fmtClock(s.startedAt),
        fmtClock(s.finishedAt),
        pausesLabel,
        fmtHm(breakMinutes(s)),
        fmtHm(worked),
        target ? fmtHm(target) : '—',
        target ? fmtSigned(worked - target) : '—',
        flags,
      ]);
    }
  }

  // BOM + ';' para o Excel em pt-BR abrir sem passar pelo assistente de importação.
  const csv = '﻿' + [head, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="ponto-${month}.csv"`,
    },
  });
}

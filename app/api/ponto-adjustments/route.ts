import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/_shared/lib/prisma';
import { getSessionPermissions } from '@/app/_shared/lib/permissions-server';
import { canManagePonto } from '@/app/_shared/lib/ponto-access';

// Ajustes do BANCO DE HORAS (compensação/abono) — só quem tem `manage_ponto`.
// A compensação nasce com minutos NEGATIVOS (abate o crédito acumulado); o
// abono nasce positivo. O saldo é recalculado na leitura do painel.

const DAYKEY_RE = /^\d{4}-\d{2}-\d{2}$/;

async function requireManager() {
  const ctx = await getSessionPermissions();
  if (!ctx) return null;
  if (!canManagePonto(ctx.userId, ctx.permissions)) return null;
  return ctx;
}

export async function GET(req: NextRequest) {
  const ctx = await requireManager();
  if (!ctx) return NextResponse.json({ error: 'Sem permissão para o banco de horas.' }, { status: 403 });

  const userId = new URL(req.url).searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'Colaborador não informado.' }, { status: 400 });

  const adjustments = await db.pontoAdjustment.findMany({
    where: { userId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    take: 100,
  });

  // Nome de quem lançou, pra lista de auditoria.
  const authorIds = [...new Set(adjustments.map((a) => a.createdById))];
  const authors = authorIds.length
    ? await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(authors.map((a) => [a.id, a.name]));

  return NextResponse.json({
    adjustments: adjustments.map((a) => ({
      id: a.id,
      date: a.date,
      minutes: a.minutes,
      kind: a.kind,
      note: a.note,
      createdByName: nameOf.get(a.createdById) ?? 'Equipe',
      createdAt: a.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const ctx = await requireManager();
  if (!ctx) return NextResponse.json({ error: 'Sem permissão para o banco de horas.' }, { status: 403 });

  const body = (await req.json()) as {
    userId?: string;
    date?: string;
    minutes?: number;
    kind?: string;
    note?: string;
  };

  if (!body.userId) return NextResponse.json({ error: 'Colaborador não informado.' }, { status: 400 });
  if (!body.date || !DAYKEY_RE.test(body.date)) return NextResponse.json({ error: 'Data inválida.' }, { status: 400 });

  const kind = body.kind === 'credit' ? 'credit' : 'compensation';
  const abs = Math.round(Math.abs(Number(body.minutes) || 0));
  if (abs <= 0 || abs > 24 * 60) return NextResponse.json({ error: 'Quantidade de horas inválida.' }, { status: 400 });

  const adjustment = await db.pontoAdjustment.create({
    data: {
      userId: body.userId,
      date: body.date,
      // Compensação abate o saldo; abono credita.
      minutes: kind === 'compensation' ? -abs : abs,
      kind,
      note: (body.note ?? '').trim().slice(0, 300) || null,
      createdById: ctx.userId,
    },
  });

  return NextResponse.json({ id: adjustment.id });
}

export async function DELETE(req: NextRequest) {
  const ctx = await requireManager();
  if (!ctx) return NextResponse.json({ error: 'Sem permissão para o banco de horas.' }, { status: 403 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Ajuste não informado.' }, { status: 400 });

  await db.pontoAdjustment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

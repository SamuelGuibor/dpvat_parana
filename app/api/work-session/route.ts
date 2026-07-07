import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const all = searchParams.get('all') === 'true';
  const month = searchParams.get('month'); // "2026-06"

  const me = await db.user.findUnique({ where: { email: session.user.email }, select: { id: true, role: true } });
  if (!me) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  if (all) {
    const where = month
      ? { date: { startsWith: month } }
      : { date: todayStr() };

    const sessions = await db.workSession.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    const userIds = [...new Set(sessions.map(s => s.userId))];
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, role: true },
    });
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));

    return NextResponse.json(sessions.map(s => ({ ...s, user: userMap[s.userId] ?? null })));
  }

  const ws = await db.workSession.findFirst({
    where: { discordId: me.id, date: todayStr() },
  });

  return NextResponse.json(ws ?? null);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const me = await db.user.findUnique({ where: { email: session.user.email }, select: { id: true, name: true } });
  if (!me) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });

  const { action } = (await req.json()) as { action: 'start' | 'pause' | 'resume' | 'finish' };
  const date = todayStr();
  const now = new Date();

  const existing = await db.workSession.findFirst({ where: { discordId: me.id, date } });

  if (action === 'start') {
    if (existing) return NextResponse.json({ error: 'Sessão já iniciada hoje' }, { status: 400 });
    const ws = await db.workSession.create({
      data: { userId: me.id, discordId: me.id, date, startedAt: now, isActive: true, isPaused: false },
    });
    return NextResponse.json(ws);
  }

  if (!existing) return NextResponse.json({ error: 'Nenhuma sessão ativa hoje' }, { status: 400 });

  if (action === 'pause') {
    const ws = await db.workSession.update({
      where: { id: existing.id },
      data: { pausedAt: now, isPaused: true },
    });
    return NextResponse.json(ws);
  }

  if (action === 'resume') {
    const ws = await db.workSession.update({
      where: { id: existing.id },
      data: { resumedAt: now, isPaused: false },
    });
    return NextResponse.json(ws);
  }

  if (action === 'finish') {
    const ws = await db.workSession.update({
      where: { id: existing.id },
      data: { finishedAt: now, isActive: false, isPaused: false },
    });
    return NextResponse.json(ws);
  }

  return NextResponse.json({ error: 'Ação inválida' }, { status: 400 });
}

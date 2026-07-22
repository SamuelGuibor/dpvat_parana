import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';

// Progresso do tutorial de onboarding, salvo em User.onboarding (Json):
// { dash: { step: number, done: boolean }, client: { step: number, done: boolean } }
// "dash" = tour da nova-dash (equipe); "client" = tour da área do cliente.

type AreaState = { step: number; done: boolean };
type OnboardingState = { dash?: AreaState; client?: AreaState };

const VALID_AREAS = ['dash', 'client'] as const;

async function getSessionUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;
  return db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, onboarding: true },
  });
}

export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
    const state = (user.onboarding ?? {}) as OnboardingState;
    return NextResponse.json({
      dash: state.dash ?? { step: 0, done: false },
      client: state.client ?? { step: 0, done: false },
    });
  } catch (err) {
    console.error('[onboarding][GET]', err);
    return NextResponse.json({ error: 'Erro ao carregar onboarding' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

    const body = await req.json();
    const area = body?.area as (typeof VALID_AREAS)[number];
    if (!VALID_AREAS.includes(area)) {
      return NextResponse.json({ error: 'area deve ser "dash" ou "client"' }, { status: 400 });
    }
    const step = Number.isFinite(body?.step) ? Math.max(0, Math.floor(body.step)) : 0;
    const done = body?.done === true;

    const current = (user.onboarding ?? {}) as OnboardingState;
    const next: OnboardingState = { ...current, [area]: { step, done } };

    await db.user.update({ where: { id: user.id }, data: { onboarding: next } });
    return NextResponse.json({ ok: true, [area]: next[area] });
  } catch (err) {
    console.error('[onboarding][POST]', err);
    return NextResponse.json({ error: 'Erro ao salvar onboarding' }, { status: 500 });
  }
}

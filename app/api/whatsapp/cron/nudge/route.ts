import { NextRequest, NextResponse } from 'next/server';
import { runNudgePhase } from '@/app/_shared/lib/whatsapp/cron-tasks';
import { isCronAuthorized } from '../auth';

// Cron NUDGE (a cada 15min): aviso de 30min de silêncio + encerramento por
// inatividade. Tem chamadas de IA (followup-decision/farewell, até 15s cada)
// — rodam em lotes de 4 em paralelo dentro da fase.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const results = await runNudgePhase();
  return NextResponse.json({ ok: true, phase: 'nudge', ...results });
}

import { NextRequest, NextResponse } from 'next/server';
import { runRecoveryPhase } from '@/app/_shared/lib/whatsapp/cron-tasks';
import { isCronAuthorized } from '../auth';

// Cron RECOVERY (de hora em hora): ciclo de recuperação standby. As janelas
// do ciclo são de 22–24h — rodar a cada 15min era invocação jogada fora; de
// hora em hora o atraso máximo de uma provocação é irrelevante.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const results = await runRecoveryPhase();
  return NextResponse.json({ ok: true, phase: 'recovery', ...results });
}

import { NextRequest, NextResponse } from 'next/server';
import { runRecoveryPhase } from '@/app/_shared/lib/whatsapp/cron-tasks';
import { isCronAuthorized } from '../auth';

// Cron RECOVERY (a cada 15min): ciclo de recuperação standby. Voltou pra
// 15min em 13/08/2026: com o marcapasso de envio (30–40s entre provocações)
// cada invocação manda ~7 mensagens, então rodar de hora em hora virava
// gargalo quando a fila de standby crescia.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const results = await runRecoveryPhase();
  return NextResponse.json({ ok: true, phase: 'recovery', ...results });
}

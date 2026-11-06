import { NextRequest, NextResponse } from 'next/server';
import { runRecoveryPhase } from '@/app/_shared/lib/whatsapp/cron-tasks';
import { isCronAuthorized } from '../auth';

// Cron RECOVERY (a cada minuto, 7h–21h de Brasília = 10–23 UTC no vercel.json):
// ciclo de recuperação standby, UM envio por rodada (05/11/2026, T-IFYLF). A
// rodada cabe em 60 s: a IA da provocação tem timeout de 15 s.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const results = await runRecoveryPhase();
  return NextResponse.json({ ok: true, phase: 'recovery', ...results });
}

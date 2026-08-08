import { NextRequest, NextResponse } from 'next/server';
import { runSlaPhase } from '@/app/_shared/lib/whatsapp/cron-tasks';
import { isCronAuthorized } from '../auth';

// Cron SLA (a cada 15min): fila de espera, SLA humano, entrega travada e
// cards estourados. Sem IA — termina em segundos. Separado de propósito: é o
// cron que NÃO PODE atrasar, e antes uma rodada lenta de despedidas/IA na
// mesma rota segurava estes alertas.

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const results = await runSlaPhase();
  return NextResponse.json({ ok: true, phase: 'sla', ...results });
}

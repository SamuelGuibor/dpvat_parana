import { NextRequest, NextResponse } from 'next/server';
import { runNudgePhase, runRecoveryPhase, runSlaPhase, mergeResults } from '@/app/_shared/lib/whatsapp/cron-tasks';
import { isCronAuthorized } from './auth';

// Cron do WhatsApp — rota AGREGADORA (07/08/2026).
//
// A lógica inteira vive em app/_shared/lib/whatsapp/cron-tasks.ts, dividida em
// 3 fases com cron próprio no vercel.json:
//   /api/whatsapp/cron/sla      a cada 15min — fila, SLA humano, entrega, cards (sem IA)
//   /api/whatsapp/cron/nudge    a cada 15min — silêncio 30min + encerramento (com IA, lotes de 4)
//   /api/whatsapp/cron/recovery de hora em hora — ciclo de recuperação standby
//
// Esta rota roda as 3 em sequência e existe para o disparo manual em dev
// (whatsapp-cron.cmd) e como fallback/compatibilidade — ela NÃO está mais no
// vercel.json.
//
// Auth: "Authorization: Bearer ${CRON_SECRET}" ou ?secret=.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  // SLA primeiro (alertas críticos), depois as fases com IA. As duas fases
  // com marcapasso de envio (30–40s entre mensagens) dividem o tempo da
  // invocação — 110s cada — pra rota agregadora não estourar os 300s.
  const PHASE_BUDGET_MS = 110_000;
  const sla = await runSlaPhase();
  const nudge = await runNudgePhase(PHASE_BUDGET_MS);
  const recovery = await runRecoveryPhase(PHASE_BUDGET_MS);
  return NextResponse.json({ ok: true, ...mergeResults(sla, nudge, recovery) });
}

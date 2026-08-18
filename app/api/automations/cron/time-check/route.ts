import { NextRequest, NextResponse } from 'next/server';
import { runTimeBasedAutomations } from '@/app/_shared/lib/automation-executor';
import { isCronAuthorized } from '../../../whatsapp/cron/auth';

// Reavalia automações com condições de tempo (tempo na coluna / data de
// vencimento) — essas não disparam por movimento de card, então precisam
// de uma varredura periódica sobre os cards que estão na coluna-gatilho.

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const summary = await runTimeBasedAutomations();
  return NextResponse.json({ ok: true, ...summary });
}

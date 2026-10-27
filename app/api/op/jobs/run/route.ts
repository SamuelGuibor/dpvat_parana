// GET /api/op/jobs/run — cron de 5 min (vercel.json) que processa os lotes em
// segundo plano da IA de operação (op_jobs; lib app/_shared/lib/op/jobs.ts).
// Auth: CRON_SECRET (isCronAuthorized), não o token do operador — /api/op já
// está em PUBLIC_API_PREFIXES do middleware. Idempotente: o claim é atômico
// por status e cada item é gravado ao terminar; dois tiques sobrepostos não
// repetem item. maxDuration 300 com orçamento de 240 s por tique. O
// iniciar_lote já dispara um tique curto na hora; este cron pega o resto (5 min
// em vez de 1 para não acordar o Neon a cada minuto sem lote).

import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorized } from "@/app/api/whatsapp/cron/auth";
import { runJobsTick } from "@/app/_shared/lib/op/jobs";
import { reportCriticalError } from "@/app/_shared/lib/report-error";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const r = await runJobsTick();
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    await reportCriticalError("op_jobs_run", err);
    return NextResponse.json({ ok: false, error: "falha ao processar os lotes" }, { status: 500 });
  }
}

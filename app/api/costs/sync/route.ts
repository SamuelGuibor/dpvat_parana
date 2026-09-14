import { NextRequest, NextResponse } from "next/server";
import { runCostSync } from "@/app/_shared/lib/cost-sync";

export const dynamic = "force-dynamic";
// Railway é consultada dia a dia; Cost Explorer e Meta são lentos.
export const maxDuration = 120;

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

/**
 * Cron diário (vercel.json, 03:30 UTC): refaz os últimos 3 dias de consumo de
 * cada provedor. `?days=35` na primeira carga.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const days = Math.min(Math.max(Number(req.nextUrl.searchParams.get("days")) || 3, 1), 62);
  try {
    const result = await runCostSync(days);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[COST SYNC]", error);
    return NextResponse.json({ error: "Falha ao sincronizar custos" }, { status: 500 });
  }
}

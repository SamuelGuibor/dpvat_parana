import { NextRequest, NextResponse } from "next/server";
import { runRetention } from "@/app/_actions/maintenance/retention";

export const dynamic = "force-dynamic";
// Primeira rodada depois de um acúmulo grande pode varrer dezenas de milhares
// de linhas.
export const maxDuration = 300;

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

/**
 * Cron diário (vercel.json): retenção das tabelas de histórico — notificações
 * do sino e logs operacionais de WhatsApp. Idempotente: rodar duas vezes no
 * mesmo dia simplesmente não acha mais nada para apagar.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const result = await runRetention();
    console.log("[RETENTION]", result);
    return NextResponse.json(result);
  } catch (error) {
    console.error("[RETENTION]", error);
    return NextResponse.json({ error: "Erro na retenção" }, { status: 500 });
  }
}

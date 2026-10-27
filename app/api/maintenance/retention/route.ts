import { NextRequest, NextResponse } from "next/server";
import { runRetention } from "@/app/_actions/maintenance/retention";
import { purgeDevPrompts } from "@/app/_shared/lib/op/retencao";

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
    // Prompts de desenvolvimento registrados pela IA de operação (decisão 19,
    // 26/10): a rodada a cada prompt cobre 24 h; esta pega o resto.
    const opDevPrompts = await purgeDevPrompts({ limit: 5_000 }).catch((err) => {
      console.error("[RETENTION] op_requests:", err);
      return null;
    });
    console.log("[RETENTION]", { ...result, opDevPrompts });
    return NextResponse.json({ ...result, opDevPrompts });
  } catch (error) {
    console.error("[RETENTION]", error);
    return NextResponse.json({ error: "Erro na retenção" }, { status: 500 });
  }
}

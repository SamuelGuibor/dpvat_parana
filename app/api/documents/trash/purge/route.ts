import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredTrash } from "@/app/_shared/lib/trash-purge";
import { purgeExpiredOpDrafts } from "@/app/_shared/lib/docs/drafts";
import { isCronAuthorized } from "@/app/api/whatsapp/cron/auth";

export const dynamic = "force-dynamic";
// Purga pode varrer muitos objetos no S3 num dia de faxina grande.
export const maxDuration = 300;

/**
 * Cron diário (vercel.json): apaga de vez o que está há mais de 30 dias na
 * lixeira da aba Arquivos. O objeto do S3 só sai se nada mais usa a key
 * (`kept` conta os preservados). Idempotente — item que falhar no S3 fica pra
 * próxima rodada. Na mesma rodada vencem os rascunhos da IA de operação
 * (`op-drafts/`, 7 dias): só esse prefixo, nunca documento do card.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const result = await purgeExpiredTrash();
    // A lixeira já rodou: falha nos rascunhos só aparece como failed -1 na resposta.
    const opDrafts = await purgeExpiredOpDrafts().catch((err) => {
      console.error("[OP DRAFTS PURGE]", err);
      return { deleted: 0, failed: -1 };
    });
    return NextResponse.json({ ...result, opDrafts });
  } catch (error) {
    console.error("[TRASH PURGE]", error);
    return NextResponse.json({ error: "Erro ao purgar a lixeira" }, { status: 500 });
  }
}

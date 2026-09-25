import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredTrash } from "@/app/_shared/lib/trash-purge";
import { isCronAuthorized } from "@/app/api/whatsapp/cron/auth";

export const dynamic = "force-dynamic";
// Purga pode varrer muitos objetos no S3 num dia de faxina grande.
export const maxDuration = 300;

/**
 * Cron diário (vercel.json): apaga de vez o que está há mais de 30 dias na
 * lixeira da aba Arquivos. O objeto do S3 só sai se nada mais usa a key
 * (`kept` conta os preservados). Idempotente — item que falhar no S3 fica pra
 * próxima rodada.
 */
export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  try {
    const result = await purgeExpiredTrash();
    return NextResponse.json(result);
  } catch (error) {
    console.error("[TRASH PURGE]", error);
    return NextResponse.json({ error: "Erro ao purgar a lixeira" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { purgeExpiredTrash } from "@/app/_actions/documents/trash";

export const dynamic = "force-dynamic";
// Purga pode varrer muitos objetos no S3 num dia de faxina grande.
export const maxDuration = 300;

function isCronAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get("secret") === secret;
}

/**
 * Cron diário (vercel.json): apaga de vez (S3 + banco) o que está há mais de
 * 30 dias na lixeira da aba Arquivos. Idempotente — item que falhar no S3
 * fica pra próxima rodada.
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

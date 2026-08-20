import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { rateLimit } from "@/app/_shared/lib/rate-limit";
import { loadByToken } from "@/app/_shared/lib/signature/tokens";

// Entrega o PDF do ciclo pelo TOKEN do link — sem sessão, porque quem abre é o
// cliente. Já assinado, entrega a versão ASSINADA (com o manifesto); antes
// disso, a versão limpa. A key do S3 nunca aparece pro navegador: o arquivo é
// transmitido por aqui.

export const dynamic = "force-dynamic";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  if (!rateLimit(`sign:pdf:${token}:${ip}`, 30, 10 * 60_000)) {
    return NextResponse.json({ error: "muitas requisições" }, { status: 429 });
  }

  const found = await loadByToken(token);
  if (!found.ok) return NextResponse.json({ error: found.reason }, { status: 404 });

  const { request } = found;
  const key = request.signedPdfKey ?? request.pdfKey;
  if (!key) return NextResponse.json({ error: "documento ainda não gerado" }, { status: 409 });

  try {
    const obj = await s3.send(new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
    }));
    const bytes = await obj.Body!.transformToByteArray();
    const download = req.nextUrl.searchParams.get("download") === "1";
    const nome = request.signedPdfKey ? "contrato-assinado.pdf" : "contrato-para-assinar.pdf";

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${nome}"`,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (err) {
    console.error("[SIGN] Falha ao entregar PDF:", token, err);
    return NextResponse.json({ error: "falha ao carregar o documento" }, { status: 500 });
  }
}

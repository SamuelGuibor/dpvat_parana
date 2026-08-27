// Gerador de Documento (IA) — proxy DOCX→PDF para o microserviço docx-converter.
//
// O preenchimento do template acontece no navegador (docxtemplater); o browser
// não fala direto com o converter (chave x-api-key não pode vazar pro cliente),
// então esta rota repassa os bytes. Retry triplo copiado de signature/pdf.ts:
// o LibreOffice dá 500 esporádico em conversões seguidas.
//
// Acesso: HARDCODED via doc-ia-access.ts (mesma trava do /api/doc-ia).

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/_shared/lib/auth";
import { canUseDocIa } from "@/app/_shared/lib/doc-ia-access";

export const maxDuration = 120;

const CONVERTER_URL = process.env.DOCX_CONVERTER_URL || "http://localhost:3001";
const CONVERTER_API_KEY = process.env.CONVERTER_API_KEY || "";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const sUser = session?.user as { id?: string; email?: string } | undefined;
  if (!canUseDocIa(sUser)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const docx = Buffer.from(await req.arrayBuffer());
  if (docx.length === 0) {
    return NextResponse.json({ error: "Arquivo vazio" }, { status: 400 });
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${CONVERTER_URL}/convert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          ...(CONVERTER_API_KEY && { "x-api-key": CONVERTER_API_KEY }),
        },
        body: new Uint8Array(docx),
        signal: AbortSignal.timeout(110_000),
      });
      if (!res.ok) {
        throw new Error(`Converter respondeu ${res.status}`);
      }
      const pdf = await res.arrayBuffer();
      return new NextResponse(pdf, {
        headers: { "Content-Type": "application/pdf" },
      });
    } catch (err) {
      lastError = err;
      if (attempt < 3) {
        await new Promise((r) => setTimeout(r, 1500 * attempt));
      }
    }
  }
  console.error("[DOC-IA] Conversão DOCX→PDF falhou:", lastError);
  return NextResponse.json(
    { error: "Falha ao converter para PDF. Tente novamente." },
    { status: 502 }
  );
}

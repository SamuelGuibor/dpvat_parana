import { NextRequest, NextResponse } from "next/server";
import { createSignatureFromCard } from "@/app/_shared/lib/whatsapp/signature";

// Geração MANUAL da procuração na ZapSign a partir do card (botão "Gerar
// Procuração ZapSign" da aba Integrações). Auth: middleware global do app.

export const dynamic = "force-dynamic";
// PDF no docx-converter (LibreOffice frio) + ZapSign podem levar dezenas de s.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const { id, type } = await req.json();
    if (!id || !["user", "process"].includes(type)) {
      return NextResponse.json({ ok: false, error: "id e type (user|process) obrigatórios" }, { status: 400 });
    }
    const result = await createSignatureFromCard(String(id), type === "process");
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  } catch (err) {
    console.error("[ZAPSIGN GENERATE] erro:", err);
    return NextResponse.json({ ok: false, error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  processSignedDoc,
  processRefusedDoc,
  markDocViewed,
} from "@/app/_shared/lib/whatsapp/signature";

// Webhook da ZapSign (eventos de assinatura da procuração).
//
// Registrado via scripts/zapsign-register-webhook.mjs com o header customizado
// x-zap-secret — a ZapSign não assina os payloads (sem HMAC), então esse
// header é a validação de origem. Além disso, NUNCA confiamos no corpo do
// evento: o processamento re-consulta o documento na API da ZapSign
// (processSignedDoc → getDoc) antes de qualquer efeito.
//
// A ZapSign reenvia o evento se não receber 200 — os handlers são
// idempotentes (status já processado → no-op).

export const dynamic = "force-dynamic";
export const maxDuration = 120; // download do PDF assinado + S3 + notificações

export async function POST(req: NextRequest) {
  const secret = process.env.ZAPSIGN_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[ZAPSIGN WEBHOOK] ZAPSIGN_WEBHOOK_SECRET não configurado — rejeitando.");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const received = req.headers.get("x-zap-secret") ?? req.nextUrl.searchParams.get("secret");
  if (received !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload: { event_type?: string; token?: string; status?: string; sandbox?: boolean };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const eventType = String(payload?.event_type ?? "");
  const docToken = String(payload?.token ?? "");
  if (!docToken) return NextResponse.json({ ok: true, skipped: "sem token" });

  console.log(`[ZAPSIGN WEBHOOK] ${eventType} doc=${docToken}${payload.sandbox ? " (sandbox)" : ""}`);

  try {
    switch (eventType) {
      case "doc_signed":
        await processSignedDoc(docToken);
        break;
      case "doc_viewed":
      case "doc_read_confirmation":
        await markDocViewed(docToken);
        break;
      case "doc_refused":
        await processRefusedDoc(docToken);
        break;
      default:
        // doc_created, signature_notification_sent, etc. — sem efeito aqui.
        break;
    }
  } catch (err) {
    // 200 mesmo com erro interno: retry da ZapSign não resolveria falha nossa,
    // e o polling do cron (runSignatureReminders) é a retaguarda que consolida.
    console.error("[ZAPSIGN WEBHOOK] Falha ao processar evento:", eventType, docToken, err);
  }

  return NextResponse.json({ ok: true });
}

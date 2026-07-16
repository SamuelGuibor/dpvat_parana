import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  ingestIncomingMessage,
  applyStatusUpdate,
  type IncomingWaMessage,
  type IncomingWaStatus,
  type IngestResult,
} from "@/app/_shared/lib/whatsapp/service";
import { handleIncomingWhatsApp } from "@/app/_shared/lib/whatsapp/bot";
import { handleAccountEvent } from "@/app/_shared/lib/whatsapp/account-events";

// Webhook da WhatsApp Cloud API (Meta oficial).
//
// GET  → handshake de verificação (feito uma vez, ao cadastrar o webhook no
//        painel do app da Meta).
// POST → eventos: mensagens recebidas dos clientes e status de entrega das
//        mensagens que enviamos. Sempre respondemos 200 rápido — a Meta
//        reenvia o evento se não receber 200, e o dedup por waMessageId
//        garante que retry não duplica nada.
//
// Env vars (Vercel):
//   WHATSAPP_VERIFY_TOKEN  string qualquer, a mesma digitada no painel da Meta
//   WHATSAPP_APP_SECRET    App Secret do app (valida a assinatura HMAC)

export const dynamic = "force-dynamic";

// 120s: o fluxo do bot agora inclui o debounce de rajada (~8s) antes de
// chamar a IA. A Vercel limita ao teto do plano automaticamente.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Valida a assinatura X-Hub-Signature-256 (HMAC-SHA256 do corpo cru com o App
 * Secret). Sem isso, qualquer um poderia postar payloads falsos aqui.
 */
function verifySignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    console.error("[WHATSAPP WEBHOOK] WHATSAPP_APP_SECRET não configurado — rejeitando.");
    return false;
  }
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const received = signatureHeader.slice("sha256=".length);
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  if (!verifySignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  interface WebhookPayload {
    entry?: {
      changes?: {
        field?: string;
        value?: {
          contacts?: { profile?: { name?: string } }[];
          messages?: IncomingWaMessage[];
          statuses?: IncomingWaStatus[];
        };
      }[];
    }[];
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  try {
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        // Eventos administrativos (violação de política, restrição, qualidade
        // do número, status de template...): registra + notifica a equipe.
        // Antes eram descartados sem rastro — a violação de spam da Meta
        // chegou por aqui e a única evidência que sobrou foi o e-mail.
        if (change?.field && change.field !== "messages") {
          await handleAccountEvent(change.field, value as Record<string, unknown> | undefined);
          continue;
        }
        if (change?.field !== "messages" || !value) continue;

        // Nome de perfil do remetente (quando a Meta manda os contatos).
        const profileName: string | undefined = value.contacts?.[0]?.profile?.name;

        // Ingere TODAS as mensagens do payload primeiro (a Meta pode mandar
        // várias de uma vez) e só depois aciona o bot — UMA vez por contato,
        // na mensagem mais recente. O lote inteiro é agregado pelo próprio
        // bot (debounce de rajada + burst desde a última resposta).
        const botCandidates = new Map<string, IngestResult>();
        for (const msg of value.messages ?? []) {
          const result = await ingestIncomingMessage(msg, profileName);
          if (result?.isNew && result.conversationStatus === "bot") {
            botCandidates.set(result.contactId, result); // fica a última do contato
          }
        }
        for (const result of botCandidates.values()) {
          await handleIncomingWhatsApp(result);
        }

        for (const st of value.statuses ?? []) {
          await applyStatusUpdate(st);
        }
      }
    }
  } catch (err) {
    // Loga mas responde 200 mesmo assim: a Meta faria retry e o dedup segura,
    // mas retry infinito de um payload problemático só gera ruído.
    console.error("[WHATSAPP WEBHOOK] Erro ao processar evento:", err);
  }

  return NextResponse.json({ ok: true });
}

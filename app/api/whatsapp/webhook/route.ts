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
import { autoFillClientInfo } from "@/app/_shared/lib/whatsapp/ficha-ai";
import { handleAccountEvent } from "@/app/_shared/lib/whatsapp/account-events";
import { getCredsByPhoneNumberId } from "@/app/_shared/lib/whatsapp/numbers";
import { reportCriticalError } from "@/app/_shared/lib/report-error";

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

// 120s: o fluxo do bot inclui o debounce de rajada (~8s) + chamada à IA (com
// retry) + envio das respostas. No plano Pro o teto é 300s, então 120s aqui é
// folga real — no Hobby ficava capado em 60s.
export const maxDuration = 120;

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
          metadata?: { phone_number_id?: string; display_phone_number?: string };
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

  // Falha de INGESTÃO (banco fora, etc.) → responde 500 pra Meta reenviar o
  // evento (retry por horas; o dedup por waMessageId segura duplicata). Falha
  // DEPOIS de persistir (bot/ficha) continua 200 — a mensagem já está salva.
  let ingestFailed = false;

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

        // MULTI-NÚMERO: qual dos NOSSOS números recebeu este evento. Número
        // desconhecido (não cadastrado nem nas envs) → ignora o lote e avisa —
        // processar sem saber o número mandaria a resposta pelo número errado.
        const phoneNumberId = value.metadata?.phone_number_id ?? "";
        const creds = await getCredsByPhoneNumberId(phoneNumberId);
        if (!creds) {
          await reportCriticalError(
            "WHATSAPP WEBHOOK",
            new Error(`Evento de phone_number_id desconhecido (${phoneNumberId || "vazio"}) — cadastre o número na tela de Números.`),
          );
          continue;
        }
        const numberId = creds.numberId;

        // Nome de perfil do remetente (quando a Meta manda os contatos).
        const profileName: string | undefined = value.contacts?.[0]?.profile?.name;

        // Ingere TODAS as mensagens do payload primeiro (a Meta pode mandar
        // várias de uma vez) e só depois aciona o bot — UMA vez por contato,
        // na mensagem mais recente. O lote inteiro é agregado pelo próprio
        // bot (debounce de rajada + burst desde a última resposta).
        const botCandidates = new Map<string, IngestResult>();
        // Contatos com mensagem nova neste lote (qualquer status): candidatos
        // ao preenchimento automático da ficha pela IA.
        const fichaCandidates = new Set<string>();
        for (const msg of value.messages ?? []) {
          try {
            const result = await ingestIncomingMessage(msg, profileName, numberId);
            if (result?.isNew) fichaCandidates.add(result.contactId);
            if (result?.isNew && result.conversationStatus === "bot") {
              botCandidates.set(result.contactId, result); // fica a última do contato
            }
          } catch (err) {
            ingestFailed = true;
            await reportCriticalError("WHATSAPP WEBHOOK ingest", err);
          }
        }
        for (const result of botCandidates.values()) {
          await handleIncomingWhatsApp(result);
        }
        // Ficha automática: roda DEPOIS do bot (a transcrição do áudio já
        // existe) e é best-effort — nunca quebra o webhook.
        for (const contactId of fichaCandidates) {
          await autoFillClientInfo(contactId);
        }

        for (const st of value.statuses ?? []) {
          await applyStatusUpdate(st);
        }
      }
    }
  } catch (err) {
    // Erro fora da ingestão por mensagem (bot, ficha, status): responde 200 —
    // a mensagem já está persistida; retry da Meta só geraria ruído. O erro
    // vai para o Discord — antes era só console.error efêmero na Vercel.
    await reportCriticalError("WHATSAPP WEBHOOK", err);
  }

  if (ingestFailed) {
    // Mensagem NÃO persistida → 500 força o retry da Meta; o dedup por
    // waMessageId garante que o que já entrou não duplica.
    return new NextResponse("ingest failed", { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

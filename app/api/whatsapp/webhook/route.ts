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
import { BURST_DEBOUNCE_MS } from "@/app/_shared/utils/bot-timing";

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

// Ficha automática no webhook (05/10/2026): teto da chamada ao Haiku, sem nova
// tentativa, e o último instante (desde o início do POST) em que ela ainda cabe
// na função. A folga de 15 s cobre o que vem antes do Haiku (até 4 anexos do
// S3) e a gravação do log. Turno de bot que passou disso fica sem ficha nesta
// rodada; a próxima rajada do cliente preenche.
const FICHA_TIMEOUT_MS = 20_000;
const FICHA_LATEST_START_MS = maxDuration * 1000 - FICHA_TIMEOUT_MS - 15_000;

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

/**
 * Bot + ficha automática de UM contato do lote. Os contatos de um mesmo POST
 * rodam em paralelo (05/10/2026): antes iam um depois do outro, e cada turno
 * leva ~35-45 s (debounce de 8 s + cérebro + atraso humanizado, todos de
 * propósito). Com 3 contatos no mesmo POST a função passava dos 120 s e
 * morria: os de trás ficavam sem resposta até o cron mandar à Fila. O prazo do
 * turno (BOT_TURN_BUDGET_MS) conta do início de cada um, então em paralelo
 * todos cabem.
 *
 * Erro de um contato não derruba os outros e fica gravado com o contato (Log
 * critical_error), como antes.
 */
async function runContactTurn(
  contactId: string,
  botTurn: IngestResult | undefined,
  fichaTurn: IngestResult,
  startedAt: number,
): Promise<void> {
  if (botTurn) {
    try {
      await handleIncomingWhatsApp(botTurn);
    } catch (err) {
      await reportCriticalError("WHATSAPP BOT", err, { contactId });
    }
  } else {
    // Conversa fora do modo bot (fila, atendente): espera o mesmo debounce
    // aqui, uma vez, e a ficha desiste se chegou mensagem mais nova (a
    // invocação dela preenche). Uma chamada ao Haiku por RAJADA, não por balão.
    await new Promise((r) => setTimeout(r, BURST_DEBOUNCE_MS));
  }
  // Ficha: DEPOIS do bot (a transcrição do áudio já existe) e best-effort —
  // nunca quebra o webhook.
  if (Date.now() - startedAt > FICHA_LATEST_START_MS) {
    console.warn(`[WHATSAPP WEBHOOK] Ficha IA pulada (sem tempo na função): ${contactId}`);
    return;
  }
  try {
    await autoFillClientInfo(contactId, {
      afterMessage: { id: fichaTurn.message.id, createdAt: fichaTurn.message.createdAt },
      timeoutMs: FICHA_TIMEOUT_MS,
    });
  } catch (err) {
    await reportCriticalError("WHATSAPP FICHA IA", err, { contactId });
  }
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const rawBody = await req.text();

  if (!verifySignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  interface WebhookPayload {
    entry?: {
      // Id da WABA que originou o lote — escopa eventos de conta (templates).
      id?: string | number;
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

  // Bot + ficha por contato, de TODOS os números do POST, em paralelo. Fora do
  // try: mesmo que algo lance no meio do laço, os turnos já iniciados são
  // esperados antes da resposta (promise solta congela quando a função responde).
  const contactTurns: Promise<void>[] = [];
  try {
    for (const entry of payload?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value;
        // Eventos administrativos (violação de política, restrição, qualidade
        // do número, status de template...): registra + notifica a equipe.
        // Antes eram descartados sem rastro — a violação de spam da Meta
        // chegou por aqui e a única evidência que sobrou foi o e-mail.
        if (change?.field && change.field !== "messages") {
          // entry.id = WABA que originou o evento — escopa o update de status
          // de template no catálogo certo (multi-número).
          await handleAccountEvent(change.field, value as Record<string, unknown> | undefined, entry?.id ? String(entry.id) : null);
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
        // ao preenchimento automático da ficha pela IA, com a ÚLTIMA mensagem
        // de cada um (a ficha desiste se chegar outra mais nova).
        const fichaCandidates = new Map<string, IngestResult>();
        for (const msg of value.messages ?? []) {
          try {
            const result = await ingestIncomingMessage(msg, profileName, numberId);
            if (result?.isNew) fichaCandidates.set(result.contactId, result);
            if (result?.isNew && result.conversationStatus === "bot") {
              botCandidates.set(result.contactId, result); // fica a última do contato
            }
          } catch (err) {
            ingestFailed = true;
            await reportCriticalError("WHATSAPP WEBHOOK ingest", err);
          }
        }
        // Todo contato com mensagem nova é candidato à ficha; os que estão em
        // modo bot passam pelo bot antes (runContactTurn). Começam já, em
        // paralelo; o POST espera todos no fim.
        for (const [contactId, fichaTurn] of fichaCandidates) {
          contactTurns.push(runContactTurn(contactId, botCandidates.get(contactId), fichaTurn, startedAt));
        }

        for (const st of value.statuses ?? []) {
          try {
            await applyStatusUpdate(st);
          } catch (err) {
            await reportCriticalError("WHATSAPP STATUS", err, { metadata: { waMessageId: st.id, status: st.status } });
          }
        }
      }
    }
  } catch (err) {
    // Erro fora da ingestão por mensagem (bot, ficha, status): responde 200 —
    // a mensagem já está persistida; retry da Meta só geraria ruído. O erro
    // passa pelo reportCriticalError (registro centralizado).
    await reportCriticalError("WHATSAPP WEBHOOK", err);
  }
  // runContactTurn não rejeita (cada etapa tem o próprio catch).
  await Promise.all(contactTurns);

  if (ingestFailed) {
    // Mensagem NÃO persistida → 500 força o retry da Meta; o dedup por
    // waMessageId garante que o que já entrou não duplica.
    return new NextResponse("ingest failed", { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

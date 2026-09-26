import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/app/_shared/lib/prisma";
import { logWhatsAppEvent } from "@/app/_shared/lib/log";

// Transcrição do áudio de uma mensagem do WhatsApp pelo micro (/transcribe,
// Gemini). Chamada ÚNICA para os dois caminhos (26/09/2026):
//   - botão "transcrever" do inbox (assist.ts → transcribeMessageAudio), com o
//     log no nome do atendente;
//   - bot, na chegada do áudio (transcribeInboundAudio): começa junto com os
//     8 s de debounce do handleIncomingWhatsApp, e a decisão recebe o áudio já
//     como texto. Antes a transcrição só começava no micro, depois do debounce,
//     e cada áudio somava ~3-7 s na resposta.
// O resultado fica em WhatsAppMessage.transcript (o 2º pedido é grátis) e o
// custo vai no log wa_transcribe com metadata.usage (micro antigo não manda
// usage: o log sai sem custo, como antes).
//
// Não importa bot.ts nem assist.ts: bot.ts importa daqui, e assist.ts importa
// bot.ts (evita ciclo de módulos).

const CHATBOT_URL = process.env.CHATBOT_URL?.replace(/\/$/, "") ?? "";
const CHATBOT_SECRET = process.env.CHATBOT_SECRET ?? "";
const TRANSCRIBE_TIMEOUT_MS = 30_000;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

/** Quem pediu a transcrição: um atendente (botão do inbox) ou o bot. */
export type TranscribeAuthor = { id: string; name: string } | "bot";

function isAudio(mediaType: string | null | undefined): boolean {
  return !!mediaType && mediaType.startsWith("audio/");
}

/**
 * POST {baseUrl}/transcribe com timeout próprio e, opcionalmente, o sinal de
 * quem chamou (o bot desiste da transcrição antecipada depois de alguns
 * segundos). Os erros saem legíveis para a tela do atendente.
 */
async function callTranscribe(
  baseUrl: string,
  body: { url: string; mimeType: string },
  signal?: AbortSignal,
): Promise<{ transcript?: string; usage?: object | null }> {
  if (!baseUrl || !CHATBOT_SECRET) {
    throw new Error("Serviço de IA não configurado (CHATBOT_URL/CHATBOT_SECRET).");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  try {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-bot-secret": CHATBOT_SECRET },
        body: JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
      });
    } catch (err) {
      if (signal?.aborted) throw new Error("transcrição cancelada por quem pediu");
      // Sem isto o atendente via um "fetch failed"/500 cru na tela. Os dois
      // casos reais: o micro fora do ar e a resposta que estourou o tempo.
      console.error(`[WHATSAPP TRANSCRIBE] Falha ao chamar ${baseUrl}/transcribe:`, err);
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("A IA demorou demais para responder. Tente de novo.");
      }
      throw new Error("Serviço de IA fora do ar — não consegui falar com o chatbot. Tente de novo em instantes.");
    }
    if (!res.ok) throw new Error(`IA respondeu HTTP ${res.status}`);
    return (await res.json()) as { transcript?: string; usage?: object | null };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Transcreve o áudio da mensagem `messageId`, grava em
 * WhatsAppMessage.transcript e registra o log wa_transcribe (com usage).
 * Já transcrita → devolve o texto salvo, sem IA. Lança em falha, com mensagem
 * legível (o botão do inbox mostra ao atendente).
 */
export async function transcribeStoredAudio(
  messageId: string,
  opts: { author: TranscribeAuthor; baseUrl?: string; signal?: AbortSignal },
): Promise<string> {
  const message = await db.whatsAppMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      contactId: true,
      mediaKey: true,
      mediaType: true,
      transcript: true,
      contact: { select: { name: true, phone: true, numberId: true } },
    },
  });
  if (!message) throw new Error("Mensagem não encontrada.");
  if (message.transcript) return message.transcript; // já transcrito
  if (!message.mediaKey || !isAudio(message.mediaType)) {
    throw new Error("Esta mensagem não tem áudio para transcrever.");
  }

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: message.mediaKey }),
    { expiresIn: 600 },
  );

  // `usage` (Gemini, modelo com sufixo "-audio") só vem do micro novo.
  const out = await callTranscribe(
    opts.baseUrl || CHATBOT_URL,
    { url, mimeType: message.mediaType! },
    opts.signal,
  );
  const transcript = out.transcript?.trim();
  if (!transcript) throw new Error("A IA não conseguiu transcrever este áudio.");

  await db.whatsAppMessage.update({ where: { id: messageId }, data: { transcript } });

  const author = opts.author;
  const agent = author === "bot" ? null : author;
  await logWhatsAppEvent({
    action: "wa_transcribe",
    message: agent ? "transcreveu um áudio da conversa" : "IA transcreveu o áudio do cliente na chegada (bot)",
    authorId: agent ? agent.id : "whatsapp-bot",
    authorName: agent ? agent.name : "🤖 Bot WhatsApp",
    contactId: message.contactId,
    numberId: message.contact.numberId,
    contactName: message.contact.name,
    contactPhone: message.contact.phone,
    // bySystem: fora do feed de atividade e das métricas por atendente do
    // painel Chatbot (o custo continua no Canto da IA).
    metadata: agent
      ? { usage: out.usage ?? undefined }
      : { usage: out.usage ?? undefined, bySystem: true, audios: 1, early: true },
  });

  return transcript;
}

/**
 * Transcrição antecipada do bot: dispara na chegada do áudio (conversa em modo
 * bot, onde o micro transcreveria de qualquer jeito, então o custo não muda) e
 * roda em paralelo ao debounce. Nunca lança: falhou ou foi cancelada, devolve
 * null e o micro transcreve na decisão, como antes.
 */
export async function transcribeInboundAudio(
  message: { id: string; mediaKey: string | null; mediaType: string | null },
  opts: { baseUrl?: string; signal?: AbortSignal } = {},
): Promise<string | null> {
  if (!message.mediaKey || !isAudio(message.mediaType)) return null;
  try {
    return await transcribeStoredAudio(message.id, { author: "bot", ...opts });
  } catch (err) {
    if (!opts.signal?.aborted) {
      console.warn(
        `[WHATSAPP TRANSCRIBE] Transcrição antecipada falhou (${message.id}) — o micro transcreve na decisão:`,
        err instanceof Error ? err.message : err,
      );
    }
    return null;
  }
}

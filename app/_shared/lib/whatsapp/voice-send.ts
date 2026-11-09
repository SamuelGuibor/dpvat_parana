// Envio "texto OU voz" para o cliente que só entende áudio (08/11/2026).
//
// Ponto único usado pelo bot (sendBotReply), pelos passos de texto dos fluxos
// e pelo sendSystemWhatsApp (automação, aviso de etapa, IA de operação). O
// texto é SEMPRE o mesmo que sairia escrito; só o formato muda. Regras:
// - contato sem `voiceReplies` ou voz não configurada → texto, como sempre;
// - qualquer falha da voz (ElevenLabs, S3, Meta) → o MESMO texto por escrito +
//   critical_error. O cliente nunca fica sem resposta nem recebe erro;
// - bloco com link ou com o comando SAIR → áudio + o texto logo depois.
//
// Não grava a mensagem: devolve as partes enviadas e cada chamador persiste do
// jeito dele (bot = sentByBot, sistema = systemSource).

import { sendText, sendVoiceBuffer, putOutboundAudioToS3 } from "./client";
import { synthesizeVoice, type VoiceContext } from "./tts";
import { reportCriticalError } from "@/app/_shared/lib/report-error";
import {
  isVoiceConfigured,
  needsTextCompanion,
  toSpeechText,
  VOICE_MAX_CHARS,
} from "@/app/_shared/utils/voice-text";

export const VOICE_MEDIA_TYPE = "audio/ogg; codecs=opus";

/** Uma mensagem que saiu de fato (o chamador grava uma linha por parte). */
export interface SentPart {
  waMessageId: string;
  /** Texto da bolha; null no áudio (o texto vai em `transcript`). */
  body: string | null;
  mediaKey: string | null;
  mediaType: string | null;
  /** O que a voz falou: a bolha mostra e o histórico do cérebro lê. */
  transcript: string | null;
}

export interface TextOrVoiceResult {
  /** Partes enviadas, na ordem. Vazio = nada saiu (ver `error`). */
  parts: SentPart[];
  /** true quando a 1ª parte foi áudio. */
  voice: boolean;
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Orçamento de voz de UM turno do bot (vários blocos em sequência no webhook,
 * maxDuration 120): passou do `deadlineAt` ou a voz já falhou num bloco, os
 * blocos seguintes vão direto em texto — com a ElevenLabs lenta, cada bloco
 * pagaria o timeout da síntese de novo e o roteiro estouraria a função.
 */
export interface VoiceBudget {
  deadlineAt: number;
  failed: boolean;
}

/**
 * Envia `text` ao contato. `voiceReplies` é o flag do contato (o chamador já
 * leu). `delayMs` é a pausa "humana" antes do envio: a geração da voz
 * acontece DENTRO dela (o cliente não espera mais do que esperaria o texto).
 */
export async function sendTextOrVoice(input: {
  phone: string;
  text: string;
  voiceReplies: boolean;
  ctx: VoiceContext;
  delayMs?: number;
  budget?: VoiceBudget;
}): Promise<TextOrVoiceResult> {
  const { phone, text, ctx } = input;
  const started = Date.now();
  const waitRest = async () => {
    const rest = (input.delayMs ?? 0) - (Date.now() - started);
    if (rest > 0) await sleep(rest);
  };
  const sendAsText = async (): Promise<TextOrVoiceResult> => {
    await waitRest();
    const r = await sendText(phone, text, undefined, ctx.numberId);
    if (!r.waMessageId) return { parts: [], voice: false, error: r.error ?? "Envio rejeitado pela Meta." };
    return {
      parts: [{ waMessageId: r.waMessageId, body: text, mediaKey: null, mediaType: null, transcript: null }],
      voice: false,
    };
  };

  const budget = input.budget;
  const withinBudget = !budget || (!budget.failed && Date.now() < budget.deadlineAt);
  const speech = input.voiceReplies && withinBudget && isVoiceConfigured() ? toSpeechText(text) : "";
  if (!speech || speech.length > VOICE_MAX_CHARS) return sendAsText();
  const fail = () => { if (budget) budget.failed = true; };

  let mediaKey: string;
  let audio: Uint8Array;
  try {
    ({ audio } = await synthesizeVoice(speech, ctx));
    mediaKey = await putOutboundAudioToS3(ctx.contactId, audio);
  } catch (err) {
    fail();
    await reportCriticalError("whatsapp.voz", err, { contactId: ctx.contactId, metadata: { source: ctx.source } });
    return sendAsText();
  }

  await waitRest();
  const voiceRes = await sendVoiceBuffer(phone, audio, ctx.numberId);
  if (!voiceRes.waMessageId) {
    fail();
    await reportCriticalError("whatsapp.voz envio", new Error(voiceRes.error ?? "Meta recusou o áudio"), {
      contactId: ctx.contactId,
      metadata: { source: ctx.source },
    });
    return sendAsText();
  }
  const parts: SentPart[] = [
    { waMessageId: voiceRes.waMessageId, body: null, mediaKey, mediaType: VOICE_MEDIA_TYPE, transcript: text },
  ];

  if (needsTextCompanion(text)) {
    const t = await sendText(phone, text, undefined, ctx.numberId);
    if (t.waMessageId) {
      parts.push({ waMessageId: t.waMessageId, body: text, mediaKey: null, mediaType: null, transcript: null });
    } else {
      await reportCriticalError("whatsapp.voz texto do link", new Error(t.error ?? "Meta recusou o texto"), {
        contactId: ctx.contactId,
        metadata: { source: ctx.source },
      });
    }
  }
  return { parts, voice: true };
}

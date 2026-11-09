// Voz da ElevenLabs para as respostas em ÁUDIO do WhatsApp (08/11/2026).
//
// Só a síntese: texto → ogg/opus (o formato que a Meta mostra como mensagem
// de voz). Quem decide falar ou escrever e quem envia é o voice-send.ts.
//
// Envs: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ELEVENLABS_MODEL (padrão
// eleven_multilingual_v2), ELEVENLABS_SPEED (padrão 1,1; faixa 0,7–1,2),
// WA_VOICE_REPLIES (interruptor geral).
//
// Custo: a ElevenLabs cobra por CARACTERE. O log `wa_tts` grava os caracteres
// em `usage.inputTokens` com o modelo "elevenlabs-<modelo>", e o preço por
// 1 M de caracteres mora em MODEL_PRICING (ai-pricing.ts) — assim o gasto
// entra no Canto da IA como as outras IAs.

import { logWhatsAppEvent } from "@/app/_shared/lib/log";
import { isOggOpus, voiceSpeed } from "@/app/_shared/utils/voice-text";

const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_MODEL = "eleven_multilingual_v2";
// Opus 48 kHz em contêiner Ogg: a Meta só faz a bolha de voz (PTT) com ogg/opus.
const OUTPUT_FORMAT = "opus_48000_64";
// O bot roda dentro do webhook (maxDuration 120): a voz não pode segurar o
// turno. Passou disso, o cliente recebe o texto (e, no bot, o resto do turno
// também vai em texto: VoiceBudget em voice-send.ts). Um bloco típico sai em
// 1–3 s.
const TTS_TIMEOUT_MS = 10_000;

export interface VoiceContext {
  contactId: string;
  numberId?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  /** Quem pediu a voz (bot, flow, automation, progress, op): vai no log. */
  source: string;
}

export interface SynthesizedVoice {
  audio: Uint8Array;
  chars: number;
  model: string;
  durationMs: number;
}

function voiceModel(): string {
  return process.env.ELEVENLABS_MODEL?.trim() || DEFAULT_MODEL;
}

/**
 * Gera o áudio. Lança em qualquer falha (sem chave, HTTP, timeout, formato
 * que não é ogg): o chamador cai no texto e registra o erro.
 */
export async function synthesizeVoice(text: string, ctx: VoiceContext): Promise<SynthesizedVoice> {
  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
  if (!apiKey || !voiceId) throw new Error("ElevenLabs não configurada (ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID)");
  const model = voiceModel();
  const started = Date.now();

  const res = await fetch(
    `${ELEVENLABS_URL}/${encodeURIComponent(voiceId)}?output_format=${OUTPUT_FORMAT}`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json", Accept: "audio/ogg" },
      body: JSON.stringify({
        text,
        model_id: model,
        // O código de idioma só é aceito pelos modelos v2.5/flash/turbo; o
        // multilingual_v2 detecta o português sozinho (e recusa o campo).
        ...(/v2_5|flash|turbo|v3/.test(model) ? { language_code: "pt" } : {}),
        // Um pouco mais rápido que o normal (ELEVENLABS_SPEED, padrão 1,1).
        voice_settings: { speed: voiceSpeed(process.env.ELEVENLABS_SPEED) },
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`ElevenLabs HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  const audio = new Uint8Array(await res.arrayBuffer());
  if (!isOggOpus(audio)) throw new Error(`ElevenLabs devolveu um formato que não é ogg/opus (${audio.length} bytes)`);
  const durationMs = Date.now() - started;
  const chars = text.length;

  // Gasto de IA sempre com await (regra do projeto): sem isto a voz some do
  // Canto da IA.
  await logWhatsAppEvent({
    action: "wa_tts",
    message: `IA gerou áudio de voz (${chars} caracteres)`,
    authorId: "whatsapp-bot",
    authorName: "🤖 Bot WhatsApp",
    contactId: ctx.contactId,
    contactName: ctx.contactName ?? null,
    contactPhone: ctx.contactPhone ?? null,
    numberId: ctx.numberId ?? null,
    metadata: {
      source: ctx.source,
      chars,
      durationMs,
      usage: {
        model: `elevenlabs-${model}`,
        inputTokens: chars,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
    },
  });

  return { audio, chars, model, durationMs };
}

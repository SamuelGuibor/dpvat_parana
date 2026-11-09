// Respostas em ÁUDIO do WhatsApp (08/11/2026) — regras puras, sem banco nem
// rede (testadas em tests/voice-text.test.ts).
//
// Para quem não sabe ler/escrever, o bot, os fluxos e as automações saem como
// mensagem de voz (ElevenLabs). O texto continua sendo o que o cérebro ou a
// equipe escreveu; aqui só se decide se dá para falar e como limpar o texto
// para a voz não ler "asterisco" ou emoji.

import { isEnvSwitchOn } from "./wa-silence";

/**
 * Origens de `sendSystemWhatsApp` que viram áudio para o cliente marcado.
 * Decisão do dono (08/11): automação do kanban, aviso de etapa e IA de
 * operação. Cobrança de pendência (`collect_nudge`), recuperação, follow-up e
 * assinatura ficam em texto de propósito.
 */
export const VOICE_SYSTEM_SOURCES: readonly string[] = ["automation", "progress", "op"];

export function isVoiceSystemSource(source: string | null | undefined): boolean {
  return !!source && VOICE_SYSTEM_SOURCES.includes(source);
}

/** Valores que o cérebro devolve no campo `voiceReplies`. */
export type VoiceRepliesDecision = "ligar" | "desligar" | "manter";

export function parseVoiceRepliesDecision(raw: unknown): VoiceRepliesDecision {
  return raw === "ligar" || raw === "desligar" ? raw : "manter";
}

/**
 * Voz disponível: chave + voz da ElevenLabs e o interruptor `WA_VOICE_REPLIES`
 * (ligado sem a env; `0`/`false`/`off` desliga tudo e volta ao texto).
 */
export function isVoiceConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return !!env.ELEVENLABS_API_KEY?.trim()
    && !!env.ELEVENLABS_VOICE_ID?.trim()
    && isEnvSwitchOn(env.WA_VOICE_REPLIES);
}

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
// Emoji (inclui bandeiras, tom de pele, ZWJ e seletor de variação).
const EMOJI_RE = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}‍️⃣]/gu;

/**
 * Bloco que precisa do TEXTO junto do áudio: link (falado não serve para
 * nada) ou o comando SAIR (o descadastro só vale pela palavra exata, exigência
 * da Meta).
 */
export function needsTextCompanion(text: string): boolean {
  return /\b(?:https?:\/\/|www\.)\S+/i.test(text) || /\bSAIR\b/.test(text);
}

/**
 * Texto que a voz vai ler: sem marcação do WhatsApp (*negrito*, _itálico_,
 * ~riscado~, ```código```), sem emoji, sem link e sem marcador de lista.
 * Quebra de linha vira pausa (ponto). Vazio = nada para falar.
 */
export function toSpeechText(text: string): string {
  const lines = text
    .replace(/```/g, "")
    .replace(URL_RE, "")
    .replace(EMOJI_RE, "")
    .replace(/[*_~]/g, "")
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*(?:[-•▪►➡→]|\d+[.)])\s+/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return lines
    .map((l) => (/[.!?:;,]$/.test(l) ? l : `${l}.`))
    .join(" ")
    .replace(/\s+([.!?,;:])/g, "$1")
    .replace(/([.!?])\.+/g, "$1")
    .trim();
}

/**
 * Velocidade da fala (`voice_settings.speed` da ElevenLabs: 0,7 a 1,2; 1 =
 * normal). Padrão 1,1 = um pouco mais rápido (pedido do dono, 09/11: a voz
 * soava arrastada). Env `ELEVENLABS_SPEED` aceita "1.05" ou "1,05"; fora da
 * faixa é cortado, lixo vira o padrão.
 */
export const VOICE_SPEED_DEFAULT = 1.1;
export function voiceSpeed(raw: string | undefined | null): number {
  const n = Number(String(raw ?? "").trim().replace(",", "."));
  if (!raw?.trim() || !Number.isFinite(n)) return VOICE_SPEED_DEFAULT;
  return Math.min(1.2, Math.max(0.7, n));
}

/** Teto de caracteres por áudio (≈ 2 min de fala): acima disso, vai em texto. */
export const VOICE_MAX_CHARS = 2500;

/** Bytes começam com "OggS"? PTT na Meta exige ogg/opus. */
export function isOggOpus(buf: Uint8Array): boolean {
  return buf.length > 4 && buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53;
}

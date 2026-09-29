// Transcrição dos áudios do cliente na nota interna da transferência
// (auditoria do WhatsApp de 24/09/2026, D11).
//
// Quando o bot manda a conversa para a Fila (handoff, "continue" vazio ou lead
// qualificado), a nota interna trazia só o motivo. Quem fazia a triagem via
// "IA não entendeu o cliente" e um áudio, e podia descartar sem ouvir (a
// auditoria achou 62 áudios com understood=false). Agora a nota leva o que o
// Gemini transcreveu. A
// nota é interna (a equipe vê; o histórico do cérebro filtra internal) e o
// texto já estava gravado em WhatsAppMessage.transcript.

/** Teto por áudio: a nota é para bater o olho, o áudio inteiro fica na thread. */
export const AUDIO_NOTE_MAX_CHARS = 600;
/** Teto de áudios na nota (o lote do bot tem até 12 mensagens): os mais recentes. */
export const AUDIO_NOTE_MAX_ITEMS = 5;

const PREFIX = "🎙️ Áudio do cliente (transcrição):";

function clip(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  // Array.from conta por code point: o corte não parte emoji ao meio.
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return `${chars.slice(0, Math.max(1, maxChars - 1)).join("").trimEnd()}…`;
}

/**
 * Uma linha `🎙️ Áudio do cliente (transcrição): "…"` por áudio transcrito, na
 * ordem do lote. Quebras de linha viram espaço (a nota é lida na lista da Fila
 * e no Copiloto). Item sem transcrição (Gemini falhou) fica de fora; nenhum
 * transcrito = null (a nota sai como antes). Passou de `maxItems`, ficam os
 * últimos e uma linha diz quantos ficaram só na conversa.
 */
export function buildAudioTranscriptNote(
  items: ReadonlyArray<{ transcript: string | null | undefined }>,
  maxChars: number = AUDIO_NOTE_MAX_CHARS,
  maxItems: number = AUDIO_NOTE_MAX_ITEMS,
): string | null {
  const texts = items
    .map((i) => (i.transcript ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (!texts.length) return null;
  const keep = texts.slice(-Math.max(1, maxItems));
  const omitted = texts.length - keep.length;
  const lines = keep.map((t) => `${PREFIX} "${clip(t, maxChars)}"`);
  if (omitted > 0) {
    lines.unshift(`(+${omitted} áudio${omitted > 1 ? "s" : ""} anterior${omitted > 1 ? "es" : ""} só na conversa)`);
  }
  return lines.join("\n");
}

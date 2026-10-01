// Regras puras do cron de silêncio (whatsapp/cron-tasks.ts): o que a última
// mensagem da conversa diz sobre quem deve o próximo passo, e quando uma
// conversa em modo bot ficou ÓRFÃ (o cliente escreveu e o bot não decidiu nada).
//
// Até 25/09/2026 o cron só olhava "a última foi do bot?": qualquer outra coisa
// ganhava o marcador de silêncio e, 60 min depois, ia calada para standby ou
// encerrada. Com isso a pergunta do cliente que o bot nunca respondeu (erro de
// infra, função interrompida) sumia sem ninguém da equipe ver.

import { isDiscardedOutcome } from './bot-telemetry';

// Palavras de FECHO: a última mensagem do cliente ser dessas não é pergunta
// pendente, é o "tá bom, obrigada" que encerra o assunto.
export const ACK_WORDS = new Set([
  'ok', 'okay', 'ta', 'tá', 'bom', 'boa', 'blz', 'beleza', 'certo', 'combinado',
  'entendi', 'entendido', 'obrigado', 'obrigada', 'obg', 'brigado', 'brigada',
  'vlw', 'valeu', 'amem', 'amém', 'então', 'entao', 'muito', 'tudo', 'bem',
  'show', 'perfeito', 'otimo', 'ótimo', 'legal', 'top', 'nada', 'de', 'tchau',
  'abraço', 'abraco', 'abraços', 'abracos', 'gratidão', 'gratidao', 'dia',
  'tarde', 'noite', 'deus', 'abençoe', 'abencoe', 'grato', 'grata',
]);

/**
 * A mensagem do cliente só fecha o assunto (agradecimento, reação, figurinha,
 * só emoji)? Legenda em cima de anexo e foto/documento sem legenda contam como
 * pendência: o cliente mandou algo para alguém olhar.
 */
export function isClosingAck(body: string | null, mediaType: string | null): boolean {
  const text = (body ?? '').trim();
  if (/\(rea[çc][ãa]o( removida)?\)$/i.test(text)) return true; // formato antigo: "👍 (reação)"
  if (/^(reagiu com\s|removeu a rea[çc][ãa]o$)/i.test(text)) return true; // "Reagiu com 👍"
  if (!text) return !mediaType || /webp/i.test(mediaType); // figurinha
  if (mediaType) return false; // legenda em cima de anexo = pendência
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return true; // só emoji
  if (words.length > 6) return false;
  return words.every((w) => ACK_WORDS.has(w));
}

/**
 * - `none`: conversa sem mensagem visível.
 * - `bot_asked`: a última foi do bot (inclui mensagem automática de sistema).
 * - `human_last`: a última saiu de um atendente (pelo CRM ou pelo celular).
 * - `client_ack`: o cliente fechou o assunto (`isClosingAck`).
 * - `client_pending`: o cliente escreveu algo que pede resposta.
 */
export type LastMessageKind = 'none' | 'bot_asked' | 'human_last' | 'client_ack' | 'client_pending';

export interface LastMessageInfo {
  direction: string;
  sentByBot: boolean;
  authorId: string | null;
  body: string | null;
  mediaType: string | null;
}

/** Classifica a última mensagem não interna da conversa. */
export function classifyLastMessage(last: LastMessageInfo | null): LastMessageKind {
  if (!last) return 'none';
  if (last.direction === 'out') return last.sentByBot ? 'bot_asked' : 'human_last';
  return isClosingAck(last.body, last.mediaType) ? 'client_ack' : 'client_pending';
}

/**
 * A última mensagem do cliente entra na rede de órfã do modo bot (se o cérebro
 * não decidiu sobre ela, vai para a Fila)?
 * - pendência: sempre;
 * - fecho ("ok", "bom dia"): também, desde 01/10/2026 — antes a lista de
 *   palavras julgava sozinha o "bom dia" que o bot nunca viu (caso José
 *   Roberto); mensagem que a IA não leu não pode ser dada como despedida pelo
 *   código. Exceção: fecho que chegou ANTES de o atendente devolver a conversa
 *   ao bot. O Devolver não roda o bot, então não há wa_bot depois do "ok", e
 *   ele voltaria à Fila como órfã (pingue-pongue do Devolver).
 */
export function isOrphanCandidate(
  kind: LastMessageKind,
  lastAt: Date,
  returnedToBotAt: Date | null,
): boolean {
  if (kind === 'client_pending') return true;
  if (kind !== 'client_ack') return false;
  return !(returnedToBotAt && returnedToBotAt.getTime() >= lastAt.getTime());
}

/**
 * Um log `wa_bot` gravado depois da mensagem do cliente prova que o cérebro
 * decidiu sobre ela, inclusive quando escolheu ficar calado (`silent`). Não
 * provam:
 * - `outcome: "discarded_*"`: resposta descartada sem nada enviado (hoje vai
 *   para o log próprio `wa_bot_discarded`, que o cron nem lê; fica a defesa);
 * - `deferredToNewer`: o erro de uma invocação anterior deixou a decisão para
 *   a mensagem mais nova, justamente a que pode ter ficado sem resposta;
 * - `handoffFailed`: o bot falhou e nem a transferência para a Fila rodou.
 * Metadata ilegível conta como decisão: na dúvida, o cron segue como antes.
 */
export function isBotDecisionLog(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return true;
  const m = metadata as Record<string, unknown>;
  if (isDiscardedOutcome(m.outcome)) return false;
  if (m.deferredToNewer === true || m.handoffFailed === true) return false;
  return true;
}

/** Motivo da órfã na nota interna e na notificação da Fila. */
export function orphanReason(waitMs: number): string {
  const min = Math.max(0, Math.round(waitMs / 60_000));
  const wait =
    min < 120 ? `${min} min`
      : min < 48 * 60 ? `${Math.round(min / 60)} h`
        : `${Math.round(min / (24 * 60))} dias`;
  return `o bot não respondeu à última mensagem do cliente (${wait} sem resposta)`;
}

/**
 * Interruptor por env de comportamento novo: ligado por padrão, e
 * `0`/`false`/`off`/`nao`/`não`/`no` desligam sem mexer no código (troca a env
 * na Vercel e refaz o deploy da mesma versão).
 */
export function isEnvSwitchOn(raw: string | undefined): boolean {
  const v = (raw ?? '').trim().toLowerCase();
  return !['0', 'false', 'off', 'nao', 'não', 'no'].includes(v);
}

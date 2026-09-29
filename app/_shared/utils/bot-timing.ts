// Regras puras do tempo do bot (whatsapp/bot.ts): debounce de rajada, prazo do
// turno e das chamadas ao cérebro, e o laço de envio (quando parar de mandar
// os blocos de uma resposta e se a ação decidida pelo cérebro ainda roda).
//
// O cérebro leva ~20 s e cada bloco sai depois do atraso humanizado. Nesse meio
// tempo o cliente pode escrever de novo ou um atendente pode assumir a conversa.
// Até 25/09/2026 o bot mandava tudo e executava a ação mesmo assim: falava
// depois de a conversa ter ido para a Fila e mandava o resto do roteiro
// comercial por cima da mensagem nova do cliente.

import type { Prisma } from "@prisma/client";

// Debounce de RAJADA: cliente que digita a mensagem picada em 3-4 balões gera
// 3-4 webhooks em segundos — sem isso são 3-4 chamadas ao Claude respondendo
// fora de ordem. Cada invocação espera o debounce; se nesse meio tempo chegou
// mensagem MAIS NOVA do cliente, esta invocação desiste (a da mensagem mais
// recente processa o lote inteiro de uma vez). A ficha automática da conversa
// fora do modo bot espera o mesmo tempo no webhook, pelo mesmo motivo (uma
// chamada ao Haiku por rajada, não por balão). O atraso é proposital.
export const BURST_DEBOUNCE_MS = 8_000;

// ---- Prazo do turno e das chamadas ao cérebro (26/09/2026) ----------------
// O bot roda dentro do webhook (maxDuration 120). Antes o pior caso era 8 s de
// debounce + 3 × 45 s de timeout do cérebro ≈ 146 s: a função podia morrer
// antes do handoff para a Fila, e a conversa ficava órfã no bot.

/**
 * Prazo total do turno do bot, contado do início do handleIncomingWhatsApp
 * (antes do debounce). Toda chamada ao cérebro cabe nele: sem tempo para uma
 * nova tentativa, o erro sobe e o handoff sai antes do maxDuration, mesmo com
 * o micro fora do ar (3 × 45 s de AbortError).
 */
export const BOT_TURN_BUDGET_MS = 100_000;

/** Menos que isto no prazo do turno não vale uma chamada ao cérebro (p50 ~15-20 s). */
export const BRAIN_MIN_ATTEMPT_MS = 10_000;

/**
 * Folga entre o orçamento mandado ao micro (header x-bot-budget-ms) e o abort
 * do CRM: o micro responde 504 com o motivo ANTES de o CRM cortar a conexão, e
 * para de gastar tokens com uma resposta que ninguém vai ler.
 */
export const BRAIN_BUDGET_MARGIN_MS = 3_000;

/**
 * Espera máxima pela transcrição antecipada do áudio depois do debounce. A
 * transcrição começa junto com os 8 s de espera; se não terminar em mais 6 s,
 * o micro transcreve na decisão, como antes.
 */
export const EARLY_TRANSCRIBE_WAIT_MS = 6_000;

/** Orçamento, em ms, que o micro pode gastar numa tentativa de `attemptTimeoutMs`. */
export function microBudgetMs(attemptTimeoutMs: number): number {
  return Math.max(1_000, Math.round(attemptTimeoutMs - BRAIN_BUDGET_MARGIN_MS));
}

/**
 * Timeout da próxima tentativa ao cérebro: o menor entre o timeout por
 * tentativa e o que sobra do prazo do turno. `null` = não cabe outra tentativa
 * (sobra menos que `minAttemptMs`). Sem prazo (`deadline` null), vale o
 * timeout por tentativa.
 */
export function brainAttemptTimeoutMs(input: {
  perAttemptMs: number;
  deadline: number | null;
  now: number;
  minAttemptMs: number;
}): number | null {
  if (input.deadline == null) return input.perAttemptMs;
  const left = input.deadline - input.now;
  if (left < input.minAttemptMs) return null;
  return Math.min(input.perAttemptMs, left);
}

/**
 * Erro de timeout do cérebro que não vem do AbortController do CRM: o 504 do
 * micro ("prazo do CRM esgotado") e o prazo do turno sem tempo para outra
 * tentativa. A flag mantém a política de retry de timeout e o
 * metadata.timeout do log; sem ela o 504 contava como erro comum (1 retry em
 * vez de 3) e a série de timeouts sumia do painel.
 */
export function brainTimeoutError(message: string): Error & { isTimeout: true } {
  const err = new Error(message) as Error & { isTimeout: true };
  err.name = "BrainTimeoutError";
  err.isTimeout = true;
  return err;
}

/**
 * O cérebro demorou demais: abort do CRM (AbortError do callBrainOnce), 504 do
 * micro ou prazo do turno (flag isTimeout). "TimeoutError" (AbortSignal.timeout)
 * fica de fora de propósito: é o que outras chamadas do turno usam (assinatura,
 * mídia da Meta), e o erro delas não é demora do cérebro.
 */
export function isBrainTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return true;
  return (err as { isTimeout?: unknown }).isTimeout === true;
}

/**
 * Espera `promise` por no máximo `ms`. `true` = terminou (resolveu ou
 * rejeitou) no prazo; `false` = o prazo venceu antes. Nunca rejeita: quem
 * chama decide o que fazer com o que ficou pela metade.
 */
export function settleWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), Math.max(0, ms));
    promise.then(
      () => { clearTimeout(timer); resolve(true); },
      () => { clearTimeout(timer); resolve(true); },
    );
  });
}

/**
 * Filtro de "chegou mensagem do cliente MAIS NOVA que esta". Desempate
 * determinístico: duas mensagens gravadas no MESMO milissegundo (dois webhooks
 * concorrentes) não se enxergavam como "mais nova" com o `gt` estrito — as
 * DUAS invocações prosseguiam e o cliente recebia resposta dupla. Em empate de
 * createdAt, o maior id (cuid ~monotônico) vence. Usado pelo bot (debounce e
 * corrida pós-cérebro) e pela ficha automática (uma por rajada).
 */
export function newerInboundWhere(
  contactId: string,
  message: { id: string; createdAt: string | Date },
): Prisma.WhatsAppMessageWhereInput {
  const at = new Date(message.createdAt);
  return {
    contactId,
    direction: "in",
    deletedAt: null,
    id: { not: message.id },
    OR: [
      { createdAt: { gt: at } },
      { createdAt: at, id: { gt: message.id } },
    ],
  };
}

/** Ações que fecham o turno do bot: fila (qualify/handoff) ou encerramento. */
const TERMINAL_BOT_ACTIONS = new Set(["qualify", "disqualify", "handoff", "resolve"]);

export function isTerminalBotAction(action: string): boolean {
  return TERMINAL_BOT_ACTIONS.has(action);
}

/**
 * - `continue_sending`: manda o próximo bloco.
 * - `stop_blocks_run_action`: para os blocos que faltam, mas a ação terminal
 *   ainda roda.
 * - `stop_all`: não manda mais nada e não executa a ação.
 */
export type SendGuardVerdict = "continue_sending" | "stop_blocks_run_action" | "stop_all";

/**
 * Decide, antes de cada bloco da resposta, se o bot segue falando.
 *
 * - A conversa saiu do modo bot (atendente assumiu ou encerrou): para tudo.
 *   Qualquer mensagem ou ação a mais atropela o atendente.
 * - Chegou mensagem mais nova do cliente ANTES do 1º bloco: para tudo, igual à
 *   corrida pós-cérebro. A invocação da mensagem nova junta o lote inteiro e
 *   responde uma vez só.
 * - Chegou mensagem mais nova no MEIO da resposta: os blocos que faltam não
 *   saem, mas a ação terminal roda. Ela foi decidida com o lote completo, e o
 *   caso comum é o lead que responde "ok" no meio do roteiro comercial: sem o
 *   qualify ele perderia a tag "Qualificada", a fila e a tarefa de card, e a
 *   conversa ficaria em modo bot. Na fila, a invocação nova sai no teste de
 *   status e o atendente vê a mensagem. `continue` e `send_flow` não fecham o
 *   turno: a invocação nova decide com o histórico real.
 */
export function shouldAbortSend(input: {
  hasNewerInbound: boolean;
  stillBot: boolean;
  action: string;
  /** Blocos desta resposta que já saíram. */
  blocksSent: number;
}): SendGuardVerdict {
  if (!input.stillBot) return "stop_all";
  if (!input.hasNewerInbound) return "continue_sending";
  if (input.blocksSent === 0) return "stop_all";
  return isTerminalBotAction(input.action) ? "stop_blocks_run_action" : "stop_all";
}

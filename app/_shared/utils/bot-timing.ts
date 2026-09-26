// Regras puras do laço de envio do bot (whatsapp/bot.ts): quando parar de
// mandar os blocos de uma resposta e se a ação decidida pelo cérebro ainda roda.
//
// O cérebro leva ~20 s e cada bloco sai depois do atraso humanizado. Nesse meio
// tempo o cliente pode escrever de novo ou um atendente pode assumir a conversa.
// Até 25/09/2026 o bot mandava tudo e executava a ação mesmo assim: falava
// depois de a conversa ter ido para a Fila e mandava o resto do roteiro
// comercial por cima da mensagem nova do cliente.

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

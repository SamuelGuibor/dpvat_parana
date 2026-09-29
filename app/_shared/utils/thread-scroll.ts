import type { WhatsAppThreadMessage } from '@/app/_shared/hooks/use-whatsapp';

// Rolagem automática da thread do inbox do WhatsApp.
//
// Auditoria de 24/09/2026 (MISSED thread): o efeito antigo só rolava quando o
// TOTAL de mensagens mudava. Com a janela das 50 recentes cheia, a mensagem
// nova do cliente tira a mais antiga e o total não muda: a tela não descia e a
// mensagem ficava escondida abaixo da dobra (43% das recebidas em
// qualificadas/fila chegam em conversa com mais de 50 mensagens). Agora quem
// manda é o id da ÚLTIMA mensagem, e quem está lendo mais acima não é puxado
// para baixo: vê o chip "Nova mensagem ↓".

type ThreadMsg = WhatsAppThreadMessage;

/** Até esta distância do fim (px) o atendente ainda está "no fim" da thread. */
export const NEAR_BOTTOM_PX = 150;

/**
 * - `jump`: conversa recém-aberta (ou trocada) → vai para o fim sem animação.
 * - `restore`: bloco de "Carregar anteriores" entrou no topo → mantém o ponto de leitura.
 * - `smooth`: mensagem nova e o atendente está no fim (ou a mensagem é dele) → desce animado.
 * - `chip`: mensagem nova e o atendente está lendo mais acima → não rola; mostra o chip.
 * - `none`: a última mensagem não mudou (poll de ticks, reação, transcrição).
 */
export type ThreadScrollAction = 'restore' | 'jump' | 'smooth' | 'chip' | 'none';

export interface ThreadScrollInput {
  /** A conversa ainda não foi posicionada no fim (abriu/trocou e esta é a 1ª carga com mensagens). */
  contactChanged: boolean;
  /** O bloco pedido em "Carregar anteriores" acabou de entrar no topo. */
  prependPending: boolean;
  /** Chegou mensagem nova no fim (ver `tailAdvanced`). */
  lastIdChanged: boolean;
  /**
   * Distância do fim ANTES de a mensagem nova entrar (a do último evento de
   * scroll). Medir depois do render somaria a altura da própria mensagem: um
   * áudio ou uma foto de 400px viraria "chip" para quem estava no fim.
   */
  distanceFromBottom: number;
  /** A última mensagem é do próprio atendente (bolha otimista ou enviada por ele). */
  lastIsMine: boolean;
}

/**
 * Ordem de prioridade: a troca de conversa vence tudo (a âncora de leitura e o
 * "fim" da conversa anterior não valem na nova); depois a âncora do prepend
 * (o atendente pediu o histórico e está lendo o topo); depois a mensagem nova.
 */
export function decideThreadScroll(input: ThreadScrollInput): ThreadScrollAction {
  if (input.contactChanged) return 'jump';
  if (input.prependPending) return 'restore';
  if (!input.lastIdChanged) return 'none';
  if (input.lastIsMine || input.distanceFromBottom < NEAR_BOTTOM_PX) return 'smooth';
  return 'chip';
}

/** Última mensagem da thread (id + createdAt), ou null com a thread vazia. */
export interface ThreadTail {
  id: string;
  createdAt: string;
}

export function threadTail(messages: readonly ThreadMsg[]): ThreadTail | null {
  const last = messages[messages.length - 1];
  return last ? { id: last.id, createdAt: last.createdAt } : null;
}

/**
 * true quando chegou mensagem nova no fim: a última mudou de id e não ficou
 * mais velha. Última que some e deixa uma ANTERIOR no fim (bolha com falha
 * descartada, mensagem apagada) não é mensagem nova — nem rola nem conta no
 * chip. A troca da bolha otimista pela real também muda o id; quem decide aí é
 * `lastIsMine` (é do próprio atendente, que já está no fim).
 */
export function tailAdvanced(prev: ThreadTail | null, next: ThreadTail | null): boolean {
  if (!next) return false;
  if (!prev) return true;
  return next.id !== prev.id && next.createdAt >= prev.createdAt;
}

/**
 * Mensagem do próprio atendente: bolha otimista (`temp-…`, ainda enviando ou
 * com falha) ou gravada com o id dele (envio, template, nota interna). Mensagem
 * do bot e de outro atendente não conta: essas o chip avisa.
 */
export function isOwnThreadMessage(msg: ThreadMsg, meId: string): boolean {
  if (msg.id.startsWith('temp-')) return true;
  return !!meId && msg.authorId === meId;
}

/**
 * Quantas mensagens entraram depois da antiga última (contador do chip). Um
 * poll pode trazer várias de uma vez (o cliente manda 3 em sequência). Se a
 * antiga última já não está na lista (a bolha otimista virou a real), conta 1.
 */
export function countNewBelow(messages: readonly ThreadMsg[], prevTailId: string | null): number {
  if (!prevTailId) return 1;
  let idx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].id === prevTailId) { idx = i; break; }
  }
  if (idx < 0) return 1;
  return Math.max(1, messages.length - 1 - idx);
}

import type { WhatsAppThreadMessage } from '@/app/_shared/hooks/use-whatsapp';
import type { WhatsAppMessageDTO } from '@/app/_shared/lib/whatsapp/service';

// Janela da thread do inbox do WhatsApp (useWhatsAppMessages).
//
// A thread é "older + recent": `recent` são as 50 mensagens mais novas, que o
// SWR rebusca a cada 8 s; `older` são os blocos de "Carregar mensagens
// anteriores", acumulados no navegador. Cada mensagem nova DESLIZA a janela
// do recent (R0..R49 → R1..R49,N): R0 sai do recent, mas não está no older
// (o bloco antigo termina antes dele) — e sumia da tela (THR-5, auditoria de
// 24/09/2026). Aqui ficam as funções puras que movem para o older o que saiu
// da janela e que colocam no cache a mensagem recém-enviada (THR-10).

type ThreadMsg = WhatsAppThreadMessage;

/**
 * Ordem da thread: createdAt ISO (toISOString, mesmo formato em todo lugar,
 * então a comparação de texto vale). O sort do JS é estável: no empate fica
 * a ordem de chegada.
 */
function byCreatedAt(a: ThreadMsg, b: ThreadMsg): number {
  if (a.createdAt < b.createdAt) return -1;
  if (a.createdAt > b.createdAt) return 1;
  return 0;
}

/**
 * Junta duas listas sem repetir id; a versão de `incoming` vence (é a mais
 * nova: veio do último poll). Resultado ordenado por createdAt.
 */
function unionById(base: readonly ThreadMsg[], incoming: readonly ThreadMsg[]): ThreadMsg[] {
  const incomingIds = new Set(incoming.map((m) => m.id));
  return [...base.filter((m) => !incomingIds.has(m.id)), ...incoming].sort(byCreatedAt);
}

/**
 * Novo `older` depois que o recent mudou de `prevRecent` para `nextRecent`:
 * as mensagens que saíram da janela e são anteriores (ou do mesmo instante)
 * ao início do novo recent vão para o older, sem duplicar id.
 *
 * - Histórico fechado (nada carregado ainda) → devolve `older` inalterado: o
 *   que sai da janela volta pelo botão "Carregar mensagens anteriores".
 *   `historyOpen` cobre o clique em voo: o bloco ainda não chegou (older
 *   vazio), mas o que deslizar agora já precisa ser guardado.
 * - Tolera janela que desliza mais de 1 por vez e recent com 51 itens (a
 *   mensagem enviada entra no cache antes do poll, ver upsertById).
 * - Mensagem que some do recent mas é MAIS NOVA que o início dele não
 *   deslizou: foi apagada no banco — não volta.
 * - Recent vazio (poll com erro) com histórico aberto: guarda tudo no older,
 *   para a thread não esvaziar; quando o recent volta, a união tira as cópias.
 */
export function mergeThreadWindow(
  older: ThreadMsg[],
  prevRecent: readonly ThreadMsg[],
  nextRecent: readonly ThreadMsg[],
  { historyOpen = older.length > 0 }: { historyOpen?: boolean } = {},
): ThreadMsg[] {
  if (!historyOpen || prevRecent.length === 0) return older;
  const nextIds = new Set(nextRecent.map((m) => m.id));
  // Início do novo recent. Não confia na ordem do array: o upsert do envio
  // pode ter posto uma mensagem fora de ordem no cache.
  let floor: string | null = null;
  for (const m of nextRecent) if (floor === null || m.createdAt < floor) floor = m.createdAt;
  const displaced = prevRecent.filter(
    (m) => !nextIds.has(m.id) && (floor === null || m.createdAt <= floor),
  );
  if (displaced.length === 0) return older;
  return unionById(older, displaced);
}

/**
 * Thread exibida = older ∪ recent, sem repetir id (o recent vence: é a versão
 * do último poll), em ordem de createdAt. Sem older, devolve o próprio recent
 * (mesma referência: o useMemo de quem consome não recalcula à toa).
 */
export function unionThreadMessages(older: readonly ThreadMsg[], recent: readonly ThreadMsg[]): ThreadMsg[] {
  if (older.length === 0) return recent as ThreadMsg[];
  if (recent.length === 0) return older as ThreadMsg[];
  return unionById(older, recent);
}

/** DTO devolvido pelas actions de envio; a de mídia já traz a URL assinada. */
export type SentMessageDTO = WhatsAppMessageDTO & {
  mediaUrl?: string | null;
  mediaUrlExpiresAt?: string | null;
};

/**
 * Mensagem da thread a partir do DTO que a action de envio devolve. Campos que
 * o DTO não traz (transcript, reaction; waMessageId e mediaUrl quando ausentes)
 * ficam `undefined` de propósito: o upsertById mantém os do servidor se o poll
 * chegou antes, e a revalidação em segundo plano completa o resto.
 */
export function toThreadMessage(dto: SentMessageDTO, authorName: string | null): ThreadMsg {
  const msg: ThreadMsg = {
    id: dto.id,
    contactId: dto.contactId,
    direction: dto.direction,
    body: dto.body,
    mediaKey: dto.mediaKey,
    mediaType: dto.mediaType,
    status: dto.status,
    sentByBot: dto.sentByBot,
    authorId: dto.authorId,
    authorName,
    internal: false,
    createdAt: dto.createdAt,
    replyToId: dto.replyToId ?? null,
    replyToBody: dto.replyToBody ?? null,
    replyToDirection: dto.replyToDirection ?? null,
  };
  if (dto.waMessageId != null) msg.waMessageId = dto.waMessageId;
  if (dto.mediaUrl && dto.mediaUrlExpiresAt) {
    msg.mediaUrl = dto.mediaUrl;
    msg.mediaUrlExpiresAt = dto.mediaUrlExpiresAt;
  }
  return msg;
}

/**
 * Coloca `msg` na lista sem duplicar id.
 * - Id novo: entra na posição do createdAt — no fim, no caso normal (a
 *   mensagem recém-enviada é a mais nova).
 * - Id que já existe (o poll/SSE trouxe antes da action responder): substitui
 *   no mesmo lugar, mas campo `undefined` em `msg` não apaga o que o servidor
 *   já mandou (mediaUrl, transcript, reação).
 */
export function upsertById(data: readonly ThreadMsg[], msg: ThreadMsg): ThreadMsg[] {
  const idx = data.findIndex((m) => m.id === msg.id);
  if (idx >= 0) {
    const merged: ThreadMsg = { ...data[idx] };
    for (const [k, v] of Object.entries(msg) as [keyof ThreadMsg, unknown][]) {
      if (v !== undefined) (merged as unknown as Record<string, unknown>)[k] = v;
    }
    const next = data.slice();
    next[idx] = merged;
    return next;
  }
  let at = data.length;
  while (at > 0 && data[at - 1].createdAt > msg.createdAt) at--;
  return [...data.slice(0, at), msg, ...data.slice(at)];
}

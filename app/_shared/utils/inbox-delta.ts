// Sincronização da lista do inbox do WhatsApp por delta: regras puras (sem
// React, sem banco) usadas pela rota GET ?since= e pelo hook da lista.
// Teste: tests/inbox-delta.test.ts.
//
// Por que existe (auditoria de 24/09/2026, B3): a lista baixava as 1.000
// conversas (~1,3 MB) a cada mudança do hash de 15 s, em toda aba aberta. Agora
// ela vem inteira só na montagem e a cada 10 min; no resto do tempo o poll
// traz só as conversas que mudaram desde o último `cursor` (quase sempre
// nenhuma) e o cliente funde por id.

/**
 * Margem subtraída do cursor em cada pedido. O `cursor` é o now() do BANCO no
 * início da leitura, mas `updatedAt`/`lastMessageAt` são gravados com o
 * relógio de quem escreveu, e o commit pode chegar depois da leitura. Com a
 * margem, uma mudança que caiu nesse vão volta no pedido seguinte. Duplicata é
 * inofensiva: o merge é idempotente.
 */
export const DELTA_OVERLAP_MS = 5_000;
/**
 * Quantas conversas a lista completa traz (as mais recentes). Mora aqui, e não
 * em inbox-data.ts (que importa o Prisma), porque o cliente corta a lista
 * fundida no MESMO teto: sem o corte ela cresceria a cada conversa nova e
 * deixaria de ser "as N mais recentes".
 */
export const INBOX_LIST_PAGE = 1000;
/** `since` mais velho que isto não vale delta: a rota manda buscar a lista inteira. */
export const DELTA_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Folga para relógio adiantado: `since` no futuro além disto é lixo (lista inteira). */
const DELTA_FUTURE_TOLERANCE_MS = 60_000;

/** `cursorIso` menos a margem, em ISO. Cursor inválido lança (só vem do servidor). */
export function sinceWithOverlap(cursorIso: string, overlapMs = DELTA_OVERLAP_MS): string {
  const t = Date.parse(cursorIso);
  if (!Number.isFinite(t)) throw new RangeError(`Cursor inválido: ${cursorIso}`);
  return new Date(t - Math.max(0, overlapMs)).toISOString();
}

/**
 * `?since=` da rota → o instante, ou `null` quando o delta não vale (ausente,
 * inválido, mais velho que 24 h ou no futuro): aí a resposta é `full: true` e
 * o cliente busca a lista inteira. Aba que ficou um dia oculta cai aqui.
 */
export function parseDeltaSince(raw: string | null | undefined, nowMs: number): Date | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  if (nowMs - t > DELTA_MAX_AGE_MS) return null;
  if (t - nowMs > DELTA_FUTURE_TOLERANCE_MS) return null;
  return new Date(t);
}

/** Linha mínima que o merge precisa (o DTO da lista satisfaz). */
type DeltaRow = { id: string; lastMessageAt: string };

function activityOf(row: DeltaRow): number {
  const t = Date.parse(row.lastMessageAt);
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

/**
 * Funde as conversas que mudaram (`incoming`, da rota `?since=`) na lista em
 * memória:
 * - upsert por `id`: a linha que veio do servidor substitui a local inteira
 *   (inclusive status `closed`, tags, leitura: a conversa muda de pasta sozinha);
 * - conversa nova entra na posição certa por `lastMessageAt` desc (a ordem do
 *   servidor); empate = a que acabou de chegar primeiro, como no patch local
 *   (`patchConversationList`);
 * - corta em `cap` (`LIST_PAGE`), para manter a semântica da lista completa
 *   ("as N mais recentes");
 * - `lockedIds`: conversas com patch otimista mais novo que o início do pedido
 *   (ou com ação em voo). A resposta foi lida ANTES do clique chegar ao banco,
 *   e sobrescrever faria a tag ou o encerramento "piscar";
 * - `insertNew: false`: só substitui quem já está na lista (resultados da
 *   busca, conversa aberta fora do topo), sem enfiar conversa que não casa.
 *
 * Idempotente (a margem do cursor repete itens) e sem mutar a entrada. Nada a
 * aplicar → a MESMA referência (o React não re-renderiza).
 */
export function mergeConversationDelta<T extends DeltaRow>(
  current: T[],
  incoming: readonly T[],
  opts: { cap: number; lockedIds?: ReadonlySet<string>; insertNew?: boolean },
): T[] {
  if (!incoming.length) return current;
  const insertNew = opts.insertNew ?? true;
  const known = insertNew ? null : new Set(current.map((c) => c.id));

  // Último que chegar vence, se o servidor repetir um id.
  const apply = new Map<string, T>();
  for (const row of incoming) {
    if (opts.lockedIds?.has(row.id)) continue;
    if (known && !known.has(row.id)) continue;
    apply.set(row.id, row);
  }
  if (!apply.size) return current;

  // Os que chegaram vão na frente do concat: o sort é estável, então no empate
  // de lastMessageAt eles ficam antes das linhas antigas.
  const merged = [...apply.values(), ...current.filter((c) => !apply.has(c.id))];
  merged.sort((a, b) => activityOf(b) - activityOf(a));
  const cap = Math.max(0, opts.cap);
  return merged.length > cap ? merged.slice(0, cap) : merged;
}

/** Edição local de uma conversa (por contactId): quando foi o último patch e quantas ações estão em voo. */
export interface LocalEdit {
  at: number;
  pending: number;
}

/** Edição sem ação em voo e mais velha que isto não trava mais nada (nenhum pedido dura tanto). */
export const LOCAL_EDIT_TTL_MS = 60_000;

/** Tira do mapa as edições que já não travam nada (sem ação em voo e mais velhas que o TTL). */
export function pruneLocalEdits(edits: Map<string, LocalEdit>, nowMs: number, ttlMs = LOCAL_EDIT_TTL_MS): void {
  for (const [contactId, edit] of edits) {
    if (edit.pending <= 0 && nowMs - edit.at > ttlMs) edits.delete(contactId);
  }
}

/**
 * Ids (da conversa) que o delta NÃO pode sobrescrever: o contato tem ação em
 * voo (`pending`) ou recebeu patch local depois que o pedido saiu
 * (`at >= startedAt`). Se sobrar algum, o cursor não avança e a conversa
 * volta no próximo pedido, já com o que a ação gravou.
 */
export function lockedConversationIds<R extends { id: string; contactId: string }>(
  incoming: readonly R[],
  edits: ReadonlyMap<string, LocalEdit>,
  startedAt: number,
): Set<string> {
  const out = new Set<string>();
  if (!edits.size) return out;
  for (const row of incoming) {
    const edit = edits.get(row.contactId);
    if (edit && (edit.pending > 0 || edit.at >= startedAt)) out.add(row.id);
  }
  return out;
}

// Regras puras da lista do inbox do WhatsApp, compartilhadas entre o servidor
// (loadConversations em app/_actions/whatsapp/conversations.ts) e o cliente,
// para a prévia montada no navegador bater com a que vem do banco.
//
// Sem "use server" e sem banco: só tipos do DTO, para os testes rodarem puros
// (tests/whatsapp-inbox.test.ts).

import type { WhatsAppConversationDTO } from '@/app/_actions/whatsapp/conversations';

/**
 * Tamanho máximo da prévia da última mensagem na lista. O corte é feito no SQL
 * (`left(body, 160)`): a linha da lista mostra uma linha só, e mandar o corpo
 * inteiro das 1.000 conversas a cada recarga era peso morto no payload.
 */
export const LIST_PREVIEW_MAX_CHARS = 160;

/**
 * Rótulo de fallback quando a última mensagem é mídia sem legenda. A lista
 * mostra um ícone do tipo na frente, então aqui vai só o nome curto.
 */
export function mediaTypeLabel(mediaType: string): string {
  if (mediaType.startsWith('image/')) return 'Foto';
  if (mediaType.startsWith('video/')) return 'Vídeo';
  if (mediaType.startsWith('audio/')) return 'Áudio';
  return 'Documento';
}

/* ---------- patch local da lista (ações otimistas) ---------- */

// Por que existe (auditoria de 24/09/2026): a tag só aparecia depois de
// recarregar as 1.000 conversas da lista — o clique esperava a action e mais a
// recarga pesada na fila serial de server actions da aba. Agora a ação aplica
// o resultado na hora, na lista em memória (e na busca / conversa hidratada
// fora do topo), e o servidor confirma depois.

/** Linha mínima que os utilitários de patch precisam (o DTO real satisfaz). */
type PatchableRow = { contactId: string; lastMessageAt: string };

/** Mudança numa conversa: campos fixos ou calculados a partir da versão ATUAL. */
export type ConversationPatch<T = WhatsAppConversationDTO> = Partial<T> | ((current: T) => Partial<T>);

/**
 * Liga/desliga uma tag numa lista de tags, sem duplicar e sem falhar ao tirar
 * o que não está lá. Devolve a MESMA referência quando nada muda (o patch
 * vira no-op e o React não re-renderiza a lista). Tag nova vai para o fim, que
 * é a ordem do servidor (aplicação mais antiga primeiro).
 */
export function withTag<T extends { id: string }>(tags: T[], tag: T, on: boolean): T[] {
  const has = tags.some((t) => t.id === tag.id);
  if (on) return has ? tags : [...tags, tag];
  return has ? tags.filter((t) => t.id !== tag.id) : tags;
}

/**
 * Mesmas tags, na mesma ordem (id, nome e cor)? Usado para não trocar o array
 * — e re-renderizar a lista inteira — quando o servidor confirma exatamente o
 * que o patch otimista já mostrava.
 */
export function sameTags<T extends { id: string; name: string; color: string }>(a: T[], b: T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((t, i) => t.id === b[i].id && t.name === b[i].name && t.color === b[i].color);
}

/**
 * Aplica um patch numa conversa. Devolve a mesma referência se o patch não
 * muda nenhum campo (comparação rasa, por referência).
 */
export function patchConversationRow<T extends PatchableRow>(row: T, patch: ConversationPatch<T>): T {
  const changes = typeof patch === 'function' ? patch(row) : patch;
  const keys = Object.keys(changes) as (keyof T)[];
  if (keys.every((k) => Object.is(row[k], changes[k]))) return row;
  return { ...row, ...changes };
}

/**
 * Aplica o patch na conversa do contato, sem mutar a lista de entrada.
 * - contato fora da lista (ou lista ainda não carregada) → MESMA referência;
 * - patch que muda `lastMessageAt` → a conversa sobe/desce para a posição
 *   certa (lista ordenada por lastMessageAt desc, como no servidor); as
 *   outras mantêm a ordem relativa.
 */
export function patchConversationList<T extends PatchableRow>(
  list: T[], contactId: string, patch: ConversationPatch<T>,
): T[];
export function patchConversationList<T extends PatchableRow>(
  list: T[] | undefined, contactId: string, patch: ConversationPatch<T>,
): T[] | undefined;
export function patchConversationList<T extends PatchableRow>(
  list: T[] | undefined, contactId: string, patch: ConversationPatch<T>,
): T[] | undefined {
  if (!list) return list;
  const idx = list.findIndex((c) => c.contactId === contactId);
  if (idx < 0) return list;
  const current = list[idx];
  const next = patchConversationRow(current, patch);
  if (next === current) return list;

  if (next.lastMessageAt === current.lastMessageAt) {
    const out = list.slice();
    out[idx] = next;
    return out;
  }
  // Reposiciona: tira da posição antiga e insere antes da primeira conversa
  // com atividade igual ou mais antiga (empate = a que acabou de mudar primeiro).
  const rest = list.filter((_, i) => i !== idx);
  const ts = Date.parse(next.lastMessageAt);
  let at = rest.findIndex((c) => Date.parse(c.lastMessageAt) <= ts);
  if (at < 0) at = rest.length;
  rest.splice(at, 0, next);
  return rest;
}

/**
 * Os valores ORIGINAIS das chaves que um patch mudou — o rollback quando a
 * action falha. Só as chaves do patch: campos que o poll atualizou nesse meio
 * tempo não voltam no tempo.
 */
export function revertPatch<T extends object>(original: T, patch: Partial<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(patch) as (keyof T)[]) out[key] = original[key];
  return out;
}

/* ---------- estado da lista (carregando / erro / vazia) ---------- */

// Por que existe (auditoria de 24/09/2026, FE-8): na 1ª carga a lista ainda
// vazia mostrava "Nenhuma conversa ainda", e o chefe lia isso como "o inbox
// não carrega". E o SWR da lista roda com shouldRetryOnError:false: se a carga
// falha, `data` fica undefined e `isLoading` volta a false — um esqueleto
// preso a "sem dados" ficaria girando para sempre. Daí os quatro estados.

export type InboxListState = 'loading' | 'error' | 'empty' | 'ready';

/**
 * O que a área da lista mostra.
 * - `loaded` = a lista já chegou alguma vez (`data !== undefined` no SWR);
 * - `searchHits` = resultados da busca no servidor, que chegam por outro
 *   caminho: com eles a lista aparece mesmo sem a carga principal.
 * Regras: "vazia" só com a lista carregada e sem nada; erro só enquanto não há
 * lista (com lista antiga na tela, a falha de uma recarga não apaga nada); a
 * tentativa em voo (`isLoading`) ganha do erro anterior, para o "Tentar
 * novamente" mostrar o esqueleto. Sem carga, sem erro e sem voo (um patch
 * local descartou a 1ª carga e o `onDiscarded` já reagendou) conta como
 * carregando.
 */
export function inboxListState(s: {
  loaded: boolean;
  isLoading: boolean;
  hasError: boolean;
  count: number;
  searchHits?: number;
}): InboxListState {
  const hits = s.searchHits ?? 0;
  if (s.loaded) return s.count > 0 || hits > 0 ? 'ready' : 'empty';
  if (hits > 0) return 'ready';
  if (s.isLoading) return 'loading';
  return s.hasError ? 'error' : 'loading';
}

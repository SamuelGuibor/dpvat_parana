// Endereços e leitura das respostas das rotas GET do inbox do WhatsApp
// (app/api/whatsapp/inbox/*). Puro — sem React, sem banco — para o
// tests/inbox-api.test.ts e para o cliente importar sem arrastar o servidor.
//
// Por que rotas GET (auditoria de 24/09/2026, FE-1): as server actions de uma
// aba saem numa fila SERIAL, e a lista de 1.000 conversas + o hash de 15 s
// seguravam o clique do atendente (tag, assumir, encerrar) atrás do poll. Por
// GET as leituras correm em paralelo e a fila fica só com mutações.

import type {
  InboxDeltaResponse, InboxItemResponse, InboxListResponse, InboxSearchResponse, InboxVersionResponse,
  WhatsAppConversationDTO,
} from '@/app/_shared/lib/whatsapp/inbox-types';

/** Lista (as mais recentes); também é a key do SWR da lista. */
export const INBOX_CONVERSATIONS_URL = '/api/whatsapp/inbox/conversations';
/**
 * Hash + total. TRANSITÓRIA: o inbox atual não consulta mais (sincroniza pelo
 * delta); a rota fica para abas com o bundle anterior.
 */
export const INBOX_VERSION_URL = '/api/whatsapp/inbox/version';
export const INBOX_SEARCH_URL = '/api/whatsapp/inbox/search';

/** UMA conversa pelo contato (abrir pela agenda, notificação ou busca fora do topo). */
export function inboxConversationUrl(contactId: string): string {
  return `${INBOX_CONVERSATIONS_URL}?contactId=${encodeURIComponent(contactId)}`;
}

/** Delta: só as conversas que mudaram desde `since` (ISO, já com a margem de `sinceWithOverlap`). */
export function inboxDeltaUrl(since: string): string {
  return `${INBOX_CONVERSATIONS_URL}?since=${encodeURIComponent(since)}`;
}

/** Busca em todo o histórico. O termo vai como veio: quem apara e corta em 2 caracteres é o servidor. */
export function inboxSearchUrl(term: string): string {
  return `${INBOX_SEARCH_URL}?q=${encodeURIComponent(term)}`;
}

// As leituras abaixo LANÇAM quando a resposta 2xx não tem o formato esperado
// (proxy, versão trocada no meio do deploy): o SWR guarda o erro e mantém o
// último dado bom na tela, em vez de guardar lixo como lista vazia.

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object';
}

/** `{ items }` da lista e da busca → as conversas. */
export function readInboxItems(body: unknown): WhatsAppConversationDTO[] {
  const items = isObject(body) ? (body as Partial<InboxListResponse | InboxSearchResponse>).items : undefined;
  if (!Array.isArray(items)) throw new Error('Resposta inválida da lista de conversas.');
  return items;
}

/** `{ item }` da hidratação por contato → a conversa, ou `null` (contato sem conversa). */
export function readInboxItem(body: unknown): WhatsAppConversationDTO | null {
  if (!isObject(body) || !('item' in body)) throw new Error('Resposta inválida da conversa.');
  const item = (body as Partial<InboxItemResponse>).item;
  return item && typeof item === 'object' ? item : null;
}

/** Contagem válida (inteiro ≥ 0) ou `null`. */
function readCount(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null;
}

/** Cursor do delta: ISO que o `Date.parse` entende, senão `null` (sem delta; a lista completa de 10 min segura). */
function readCursor(v: unknown): string | null {
  return typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;
}

/** `{ version, total }` do hash. */
export function readInboxVersion(body: unknown): InboxVersionResponse {
  const b = isObject(body) ? (body as Partial<InboxVersionResponse>) : null;
  if (!b || typeof b.version !== 'string') throw new Error('Resposta inválida da versão do inbox.');
  return { version: b.version, total: readCount(b.total) ?? 0 };
}

/**
 * `{ items, cursor, total }` da lista completa. Sem cursor válido (servidor
 * anterior ao delta) a lista vale do mesmo jeito: só não há delta até a
 * próxima lista completa.
 */
export function readInboxList(body: unknown): InboxListResponse {
  const items = readInboxItems(body);
  const b = body as Partial<InboxListResponse>;
  return { items, cursor: readCursor(b.cursor), total: readCount(b.total) ?? 0 };
}

/**
 * `{ items, cursor, full, total }` do delta. `full` precisa ser booleano, e o
 * delta que não pede a lista inteira precisa de cursor válido: sem ele o
 * próximo pedido não teria de onde partir.
 */
export function readInboxDelta(body: unknown): InboxDeltaResponse {
  const items = readInboxItems(body);
  const b = body as Partial<InboxDeltaResponse>;
  if (typeof b.full !== 'boolean') throw new Error('Resposta inválida do delta da lista.');
  const cursor = readCursor(b.cursor);
  if (!b.full && !cursor) throw new Error('Resposta inválida do delta da lista.');
  return { items, cursor, full: b.full, total: readCount(b.total) };
}

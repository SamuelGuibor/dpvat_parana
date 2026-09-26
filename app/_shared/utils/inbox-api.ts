// Endereços e leitura das respostas das rotas GET do inbox do WhatsApp
// (app/api/whatsapp/inbox/*). Puro — sem React, sem banco — para o
// tests/inbox-api.test.ts e para o cliente importar sem arrastar o servidor.
//
// Por que rotas GET (auditoria de 24/09/2026, FE-1): as server actions de uma
// aba saem numa fila SERIAL, e a lista de 1.000 conversas + o hash de 15 s
// seguravam o clique do atendente (tag, assumir, encerrar) atrás do poll. Por
// GET as leituras correm em paralelo e a fila fica só com mutações.

import type {
  InboxItemResponse, InboxListResponse, InboxSearchResponse, InboxVersionResponse, WhatsAppConversationDTO,
} from '@/app/_shared/lib/whatsapp/inbox-types';

/** Lista (as mais recentes); também é a key do SWR da lista. */
export const INBOX_CONVERSATIONS_URL = '/api/whatsapp/inbox/conversations';
/** Hash + total; também é a key do SWR da versão (lida por dois hooks). */
export const INBOX_VERSION_URL = '/api/whatsapp/inbox/version';
export const INBOX_SEARCH_URL = '/api/whatsapp/inbox/search';

/** UMA conversa pelo contato (abrir pela agenda, notificação ou busca fora do topo). */
export function inboxConversationUrl(contactId: string): string {
  return `${INBOX_CONVERSATIONS_URL}?contactId=${encodeURIComponent(contactId)}`;
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

/** `{ version, total }` do hash. */
export function readInboxVersion(body: unknown): InboxVersionResponse {
  const b = isObject(body) ? (body as Partial<InboxVersionResponse>) : null;
  if (!b || typeof b.version !== 'string') throw new Error('Resposta inválida da versão do inbox.');
  const total = typeof b.total === 'number' && Number.isFinite(b.total) && b.total >= 0 ? Math.floor(b.total) : 0;
  return { version: b.version, total };
}

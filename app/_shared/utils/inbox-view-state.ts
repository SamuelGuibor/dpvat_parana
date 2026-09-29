// Estado de navegação do inbox do WhatsApp que sobrevive à troca de aba da
// nova-dash.
//
// Auditoria de 24/09/2026 (THR-4/LISTA-9): as abas da nova-dash desmontam o
// inbox (de propósito: montado escondido ele manteria SSE e polls rodando), e
// voltar do Kanban para o WhatsApp perdia a conversa aberta, a pasta, a busca
// e os filtros. O WhatsAppInbox grava este estado no sessionStorage (por aba
// do navegador; some ao fechar a aba) a cada mudança e o restaura no mount.
//
// Nada aqui é estado crítico: storage bloqueado, JSON estragado ou campo
// inválido = inbox limpo naquele campo, nunca erro na tela.

/** Chave do sessionStorage com a navegação do inbox. */
export const INBOX_VIEW_STORAGE_KEY = 'wa-inbox-view';

/**
 * Pedido de "abrir esta conversa" gravado por notificação, menção, `?wa=` do
 * card etc. ANTES de trocar de aba (o inbox ainda não está montado para ouvir
 * o CustomEvent). Vence o contactId restaurado: o clique é mais novo.
 */
export const OPEN_CONTACT_STORAGE_KEY = 'wa-open-contact';

/**
 * Pastas do rail do inbox. O `ACTIVE_FOLDERS`/`CLOSED_FOLDERS` do
 * WhatsAppInbox é conferido contra esta lista em tempo de compilação: pasta
 * nova no rail entra aqui também, senão a restauração a trocaria por 'todos'.
 */
export const INBOX_FOLDER_KEYS = [
  'todos', 'ativas', 'bot', 'standby',
  'qualified', 'unqualified', 'sem_resposta', 'perguntas', 'novo_acidente', 'transferido', 'descartado', 'churn',
] as const;
export type InboxFolderKey = (typeof INBOX_FOLDER_KEYS)[number];
export const DEFAULT_INBOX_FOLDER: InboxFolderKey = 'todos';

/** Intervalo de data de entrada: dias "YYYY-MM-DD" (Brasília), inclusivos. */
export interface InboxDateRange { from: string; to: string; label: string }

export interface InboxViewState {
  contactId: string | null;
  folder: InboxFolderKey;
  search: string;
  tagFilter: string[];
  dateRange: InboxDateRange | null;
  /** Id da Label (coluna do Kanban). Estado antigo guardava o nome: `pruneColumnFilter` converte. */
  columnFilter: string | null;
  contactsMode: boolean;
}

/** O que o inbox precisa do Storage (o sessionStorage real ou um falso nos testes). */
export type InboxViewStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// Tetos contra lixo no storage (o JSON pode ter sido gravado por outra versão
// do código ou mexido à mão no DevTools).
const MAX_ID_LEN = 100;
const MAX_TEXT_LEN = 200;
const MAX_TAGS = 50;
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function text(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= max ? v : null;
}

function parseFolder(v: unknown): InboxFolderKey {
  return (INBOX_FOLDER_KEYS as readonly unknown[]).includes(v) ? (v as InboxFolderKey) : DEFAULT_INBOX_FOLDER;
}

function parseTagFilter(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const ids = v.filter((id): id is string => text(id, MAX_ID_LEN) !== null);
  return [...new Set(ids)].slice(0, MAX_TAGS);
}

function parseDateRange(v: unknown): InboxDateRange | null {
  if (!v || typeof v !== 'object') return null;
  const { from, to, label } = v as Record<string, unknown>;
  if (typeof from !== 'string' || typeof to !== 'string' || !DAY_KEY_RE.test(from) || !DAY_KEY_RE.test(to)) return null;
  if (from > to) return null;
  const l = text(label, MAX_TEXT_LEN);
  return l ? { from, to, label: l } : null;
}

/** JSON do storage → estado válido. JSON inválido ou que não é objeto → null; campo inválido → valor padrão. */
export function parseInboxViewState(raw: string | null | undefined): InboxViewState | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  return {
    contactId: text(o.contactId, MAX_ID_LEN),
    folder: parseFolder(o.folder),
    search: typeof o.search === 'string' ? o.search.slice(0, MAX_TEXT_LEN) : '',
    tagFilter: parseTagFilter(o.tagFilter),
    dateRange: parseDateRange(o.dateRange),
    columnFilter: text(o.columnFilter, MAX_TEXT_LEN),
    contactsMode: o.contactsMode === true,
  };
}

/** Estado → JSON do storage (só os campos conhecidos, na mesma forma que o parse aceita). */
export function serializeInboxViewState(state: InboxViewState): string {
  return JSON.stringify({
    contactId: state.contactId,
    folder: state.folder,
    search: state.search,
    tagFilter: state.tagFilter,
    dateRange: state.dateRange ? { from: state.dateRange.from, to: state.dateRange.to, label: state.dateRange.label } : null,
    columnFilter: state.columnFilter,
    contactsMode: state.contactsMode,
  });
}

/** O sessionStorage do navegador, ou null (SSR, ou acesso bloqueado, que lança SecurityError). */
export function browserSessionStorage(): InboxViewStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveInboxViewState(storage: InboxViewStorage | null, state: InboxViewState): void {
  try {
    storage?.setItem(INBOX_VIEW_STORAGE_KEY, serializeInboxViewState(state));
  } catch {
    // Cota cheia ou storage bloqueado: o inbox só não lembra a navegação.
  }
}

/** Lê e APAGA o pedido de abertura (um F5 depois não reabre a conversa do pedido). */
export function takeOpenContactRequest(storage: InboxViewStorage | null): string | null {
  try {
    const id = storage?.getItem(OPEN_CONTACT_STORAGE_KEY) ?? null;
    if (id) storage?.removeItem(OPEN_CONTACT_STORAGE_KEY);
    return text(id, MAX_ID_LEN);
  } catch {
    return null;
  }
}

export interface RestoredInboxView {
  view: InboxViewState;
  /** A conversa veio de um pedido de abertura (notificação, menção, card), não da navegação salva. */
  fromRequest: boolean;
}

/**
 * Estado inicial do inbox no mount: a navegação salva + o pedido de abertura,
 * lidos juntos e com o pedido por último (ele vence o contactId salvo, e as
 * pastas/filtros salvos continuam valendo). Nada salvo e nenhum pedido → null.
 */
export function restoreInboxView(storage: InboxViewStorage | null): RestoredInboxView | null {
  let saved: InboxViewState | null = null;
  try {
    saved = parseInboxViewState(storage?.getItem(INBOX_VIEW_STORAGE_KEY));
  } catch {
    saved = null;
  }
  const requested = takeOpenContactRequest(storage);
  if (!requested) return saved ? { view: saved, fromRequest: false } : null;
  const base: InboxViewState = saved ?? {
    contactId: null, folder: DEFAULT_INBOX_FOLDER, search: '', tagFilter: [],
    dateRange: null, columnFilter: null, contactsMode: false,
  };
  return { view: { ...base, contactId: requested }, fromRequest: true };
}

/**
 * Tira do filtro as tags que não existem mais (apagadas no modal ou em outra
 * aba). Sem isso o filtro restaurado mostraria "Tags (1)" e uma lista vazia.
 * Devolve a MESMA referência quando nada muda (setState sem render extra).
 */
export function pruneTagFilter(tagFilter: string[], known: ReadonlyArray<{ id: string }> | undefined): string[] {
  if (!known || tagFilter.length === 0) return tagFilter;
  const ids = new Set(known.map((t) => t.id));
  const next = tagFilter.filter((id) => ids.has(id));
  return next.length === tagFilter.length ? tagFilter : next;
}

/**
 * O filtro de coluna guarda o ID da Label (desde que o filtro foi ao banco,
 * 26/09/2026). Estado salvo antes disso guardava o NOME da coluna: vira o id
 * da coluna com esse nome. Coluna apagada (id e nome desconhecidos) sai do
 * filtro, senão a lista ficaria vazia com o chip ligado. Colunas ainda não
 * carregadas → fica como está. Mesma referência quando nada muda.
 */
export function pruneColumnFilter(
  columnFilter: string | null,
  known: ReadonlyArray<{ id: string; name: string }> | undefined,
): string | null {
  if (!known || !columnFilter) return columnFilter;
  if (known.some((c) => c.id === columnFilter)) return columnFilter;
  return known.find((c) => c.name === columnFilter)?.id ?? null;
}

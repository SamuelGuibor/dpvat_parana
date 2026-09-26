// Mídias e notas de TODA a conversa de um contato para as abas Arquivos e
// Notas do Copiloto (GET /api/whatsapp/inbox/contact-files). Puro — sem
// React, sem banco — para o tests/contact-files.test.ts, para a rota validar
// a query e para o cliente importar sem arrastar o servidor.
//
// Por que existe (auditoria de 24/09/2026, THR-3/DOC-2): as duas abas liam só
// a janela da thread (as 50 mensagens mais recentes). 31% dos documentos que o
// cliente manda ficavam fora dela — o RG enviado no começo da triagem só
// aparecia depois de "carregar anteriores" — e só 2,7% das fotos recebidas
// chegavam ao card. As notas antigas sumiam da aba Notas pelo mesmo motivo.

export const CONTACT_FILES_URL = '/api/whatsapp/inbox/contact-files';

export type ContactFileKind = 'media' | 'notes';
/** `in` = só o que o CLIENTE mandou (padrão: sem os vídeos e áudios do bot); `all` = a conversa toda. */
export type ContactFileDirection = 'in' | 'all';

/** Página de mídia: 24 miniaturas. Não há thumbnail no S3, a grade baixa o ORIGINAL de cada foto. */
export const CONTACT_MEDIA_PAGE = 24;
/** Página de notas: texto curto (o maior contato medido em 09/2026 tinha 39 notas). */
export const CONTACT_NOTES_PAGE = 40;
const MAX_PAGE = 60;

export interface ContactMediaItem {
  id: string;
  mediaKey: string;
  mediaType: string | null;
  direction: string; // in | out
  sentByBot: boolean;
  createdAt: string;
  /** Nome legível (mediaDisplayName): o mesmo da bolha e do "Anexar no card". */
  name: string;
  /** URL de leitura já assinada (inline, com `name`); null = key fora da allowlist (fallback por action). */
  mediaUrl: string | null;
  mediaUrlExpiresAt: string | null;
}

export interface ContactNoteItem {
  id: string;
  body: string | null;
  authorId: string | null;
  authorName: string | null;
  sentByBot: boolean;
  createdAt: string;
}

export interface ContactFilesPage<T> {
  items: T[];
  /** Há mais itens mais antigos que o último desta página. */
  hasMore: boolean;
  /**
   * Mídias ainda fora do card/ficha no filtro de direção pedido. Só na 1ª
   * página de `media` (sem cursor); `null` nas outras e em `notes`.
   */
  unattachedCount: number | null;
}

export interface ContactFilesQuery {
  contactId: string;
  kind: ContactFileKind;
  /** Só `media`. */
  direction: ContactFileDirection;
  /** Só `media`: esconde as mídias cuja key já é documento ativo do card (ou do rascunho). */
  onlyUnattached: boolean;
  /** Cursor: itens com createdAt ANTES deste ISO (paginação "carregar mais"). */
  before: string | null;
  /** Desempate do cursor para duas mensagens no mesmo milissegundo. */
  beforeId: string | null;
  limit: number;
}

/**
 * URL de uma página; também é a key do SWR (parâmetros sempre na mesma ordem,
 * e só os que valem para o `kind`: trocar o filtro troca a key).
 */
export function contactFilesUrl(q: {
  contactId: string;
  kind: ContactFileKind;
  direction?: ContactFileDirection;
  onlyUnattached?: boolean;
  before?: string | null;
  beforeId?: string | null;
  limit?: number;
}): string {
  const params = new URLSearchParams();
  params.set('contactId', q.contactId);
  params.set('kind', q.kind);
  if (q.kind === 'media') {
    params.set('direction', q.direction ?? 'in');
    if (q.onlyUnattached) params.set('onlyUnattached', '1');
  }
  if (q.before) params.set('before', q.before);
  if (q.before && q.beforeId) params.set('beforeId', q.beforeId);
  if (q.limit) params.set('limit', String(Math.floor(q.limit)));
  return `${CONTACT_FILES_URL}?${params.toString()}`;
}

/**
 * Query da rota → parâmetros validados, ou o motivo do 400. Direção e flag
 * desconhecidas são erro (não viram o padrão em silêncio): a tela diria "só
 * do cliente" mostrando outra coisa.
 */
export function parseContactFilesParams(
  sp: URLSearchParams,
): { value: ContactFilesQuery } | { error: string } {
  const contactId = (sp.get('contactId') ?? '').trim();
  if (!contactId) return { error: 'contactId obrigatório.' };

  const kindRaw = sp.get('kind') ?? 'media';
  if (kindRaw !== 'media' && kindRaw !== 'notes') return { error: 'kind inválido (media ou notes).' };
  const kind: ContactFileKind = kindRaw;

  const directionRaw = sp.get('direction') ?? 'in';
  if (directionRaw !== 'in' && directionRaw !== 'all') return { error: 'direction inválida (in ou all).' };

  const flag = sp.get('onlyUnattached');
  if (flag !== null && !['1', '0', 'true', 'false'].includes(flag)) return { error: 'onlyUnattached inválido.' };

  const beforeRaw = sp.get('before');
  let before: string | null = null;
  if (beforeRaw) {
    const t = Date.parse(beforeRaw);
    if (!Number.isFinite(t)) return { error: 'before inválido.' };
    before = new Date(t).toISOString();
  }
  const beforeId = before ? (sp.get('beforeId') ?? '').trim() || null : null;

  const defaultLimit = kind === 'media' ? CONTACT_MEDIA_PAGE : CONTACT_NOTES_PAGE;
  const limitNum = Number(sp.get('limit'));
  const limit = Number.isFinite(limitNum) && limitNum >= 1 ? Math.min(Math.floor(limitNum), MAX_PAGE) : defaultLimit;

  return {
    value: {
      contactId,
      kind,
      direction: directionRaw,
      onlyUnattached: flag === '1' || flag === 'true',
      before,
      beforeId,
      limit,
    },
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Corpo 2xx da rota → página. LANÇA fora do formato (proxy, versão trocada no
 * meio do deploy): o SWR guarda o erro e mantém a grade que já estava na tela.
 */
export function readContactFilesPage<T>(body: unknown): ContactFilesPage<T> {
  if (!isObject(body) || !Array.isArray(body.items) || typeof body.hasMore !== 'boolean') {
    throw new Error('Resposta inválida dos arquivos da conversa.');
  }
  const count = body.unattachedCount;
  return {
    items: body.items as T[],
    hasMore: body.hasMore,
    unattachedCount: typeof count === 'number' && Number.isFinite(count) && count >= 0 ? Math.floor(count) : null,
  };
}

/** Páginas → lista única, sem repetir id (uma revalidação pode deslocar um item entre páginas). */
export function flattenPages<T extends { id: string }>(pages: ContactFilesPage<T>[] | undefined): T[] {
  if (!pages?.length) return [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
  }
  return out;
}

/** Cursor da próxima página: o último item (o mais antigo) da página anterior. */
export function nextPageCursor(
  prev: { items: { id: string; createdAt: string }[]; hasMore: boolean } | null,
): { before: string; beforeId: string } | null {
  if (!prev?.hasMore) return null;
  const last = prev.items[prev.items.length - 1];
  return last ? { before: last.createdAt, beforeId: last.id } : null;
}

/** Forma mínima de uma mensagem da thread que as funções abaixo leem. */
interface ThreadLike {
  id: string;
  body?: string | null;
  mediaKey?: string | null;
  internal?: boolean;
  sentByBot?: boolean;
  authorName?: string | null;
  createdAt: string;
  deletedAt?: string | null;
}

export interface NoteView {
  id: string;
  body: string | null;
  authorName: string | null;
  sentByBot: boolean;
  createdAt: string;
}

function newerFirst(a: NoteView, b: NoteView): number {
  const d = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  if (d) return d;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
}

/**
 * Notas da aba Notas: as da janela da thread (vivas: o poll de 8 s traz a
 * nota nova e a apagada) + as do histórico inteiro (kind=notes, sem poll).
 * Mesmo id → vale a da thread (mais recente). Nota apagada na thread some
 * também do histórico. Da mais nova para a mais antiga.
 */
export function mergeNotes(windowMessages: ThreadLike[], fetched: ContactNoteItem[] | undefined): NoteView[] {
  const byId = new Map<string, NoteView>();
  const deleted = new Set<string>();
  for (const m of windowMessages) {
    if (!m.internal) continue;
    if (m.deletedAt) { deleted.add(m.id); continue; }
    byId.set(m.id, {
      id: m.id, body: m.body ?? null, authorName: m.authorName ?? null, sentByBot: !!m.sentByBot, createdAt: m.createdAt,
    });
  }
  for (const n of fetched ?? []) {
    if (byId.has(n.id) || deleted.has(n.id)) continue;
    byId.set(n.id, { id: n.id, body: n.body, authorName: n.authorName, sentByBot: n.sentByBot, createdAt: n.createdAt });
  }
  return [...byId.values()].sort(newerFirst);
}

/**
 * Nota do bot mais recente ("por que caiu na fila"): a transferência deixa uma
 * nota interna do bot. `notes` já vem da mais nova para a mais antiga.
 */
export function latestBotNote<T extends { sentByBot: boolean; body: string | null }>(notes: T[]): T | null {
  return notes.find((n) => n.sentByBot && !!n.body?.trim()) ?? null;
}

/**
 * Id da mídia mais recente da janela da thread (sem as otimistas e as
 * apagadas). Quando muda, a grade da aba Arquivos busca de novo: a lista do
 * histórico não tem poll próprio, e o da thread (8 s) já está rodando.
 */
export function latestMediaMessageId(messages: ThreadLike[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.mediaKey && !m.deletedAt && !m.id.startsWith('temp-')) return m.id;
  }
  return null;
}

/** Máximo de mídias num "Anexar selecionadas" (a action recusa acima disso). */
export const ATTACH_BATCH_MAX = 50;

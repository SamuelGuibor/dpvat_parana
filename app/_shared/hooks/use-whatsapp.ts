'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { useSWRConfig, type KeyedMutator } from 'swr';
import useSWRInfinite, { type SWRInfiniteConfiguration } from 'swr/infinite';
// SÓ tipos (`import type`): inbox-data.ts, ao lado, importa o Prisma e não
// pode entrar no bundle do navegador.
import type {
  InboxColumnOption, InboxDeltaResponse, InboxListResponse, InboxSearchResponse, WhatsAppConversationDTO,
} from '@/app/_shared/lib/whatsapp/inbox-types';
import { listWaNumberOptions } from '@/app/_actions/whatsapp/numbers';
import { createCoalescer, createSingleFlight, type Coalescer } from '@/app/_shared/utils/refresh-gate';
import { mergeThreadWindow, unionThreadMessages, upsertById } from '@/app/_shared/utils/thread-window';
import { HttpError, jsonFetcher, pollRetryDelayMs } from '@/app/_shared/utils/fetch-json';
import {
  INBOX_COLUMNS_URL, INBOX_CONVERSATIONS_URL, inboxConversationUrl, inboxDeltaUrl, inboxFilterUrl,
  readInboxColumns, readInboxDelta, readInboxFilter, readInboxItem, readInboxList,
} from '@/app/_shared/utils/inbox-api';
import {
  INBOX_LIST_PAGE, lockedConversationIds, mergeConversationDelta, pruneLocalEdits, sinceWithOverlap,
  type LocalEdit,
} from '@/app/_shared/utils/inbox-delta';
import {
  contactFilesUrl, flattenPages, nextPageCursor, readContactFilesPage,
  type ContactFileDirection, type ContactFilesPage, type ContactMediaItem, type ContactNoteItem,
} from '@/app/_shared/utils/contact-files';

// Hooks do atendimento de WhatsApp — mesmo desenho do use-chat.ts:
// SWR com polling como rede de segurança e o SSE (useChatStream, reaproveitado
// do chat interno) acelerando via mutate. Canal SSE: "whatsapp:<contactId>".

export interface WhatsAppThreadMessage {
  id: string;
  contactId: string;
  direction: string; // in | out
  body: string | null;
  mediaKey: string | null;
  mediaType: string | null;
  status: string; // sending (otimista, só no client) | sent | delivered | read | failed
  sentByBot: boolean;
  authorId: string | null;
  authorName: string | null;
  internal: boolean;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  // Transcrição do áudio (feita sob demanda pelo botão "transcrever").
  transcript?: string | null;
  replyToId?: string | null;
  replyToBody?: string | null;
  replyToDirection?: string | null;
  // Id da Meta (só mensagens que passaram pela Cloud API podem receber reação).
  waMessageId?: string | null;
  // Reação da equipe aplicada a esta mensagem (1 emoji, estilo WhatsApp).
  reaction?: string | null;
  reactionAuthorId?: string | null;
  // URL de leitura da mídia já assinada pela rota da thread (janela estável de
  // 30 min: a mesma URL entre polls). Ausente em mensagem otimista e em key
  // fora da allowlist: a bolha cai no fallback do media-url-cache.
  mediaUrl?: string | null;
  mediaUrlExpiresAt?: string | null;
}

// Toda leitura por URL daqui passa por `jsonFetcher` (fetch-json.ts): status
// não-ok LANÇA. As rotas (thread, lista, delta, busca) decidem o acesso pelo
// banco + trava de IP (`teamRoute`) e podem responder 403 (atendente mudou de
// rede com a aba aberta) ou 500 (banco); com um fetcher que não olha o status
// isso viraria dado e esvaziaria a tela. O SWR guarda o erro e mantém o
// último dado bom.
//
// Lista, delta e busca são GET, não server actions (auditoria de 24/09/2026,
// FE-1): as actions de uma aba saem numa fila SERIAL, e a recarga da lista e o
// hash de 15 s seguravam o clique do atendente (tag, assumir, encerrar). A
// fila de actions agora fica só com mutações.

/**
 * Busca + filtros (tag, data de entrada, coluna) em TODO o histórico (GET,
 * fora da fila de actions): uma página a partir de `skip` e o total que casa.
 * `query` = `inboxFilterQuery(...)` (inbox-filter.ts). Lança `HttpError` na falha.
 */
export async function fetchInboxFilter(query: string, skip = 0): Promise<InboxSearchResponse> {
  return readInboxFilter(await jsonFetcher<unknown>(inboxFilterUrl(query, skip)));
}

/** UMA conversa pelo contato (abrir fora do topo da lista); `null` = contato sem conversa. */
export async function fetchInboxConversation(contactId: string): Promise<WhatsAppConversationDTO | null> {
  return readInboxItem(await jsonFetcher<unknown>(inboxConversationUrl(contactId)));
}

/**
 * O que a key da lista guarda no cache do SWR: a lista completa + de onde o
 * delta parte. `gen` muda a cada lista completa APLICADA (o SWR descarta a
 * carga que um patch local atropelou): o delta que saiu sobre uma base velha
 * não cai na nova, e o cursor dele só vale para a base em que foi aplicado.
 */
interface InboxListData extends InboxListResponse {
  gen: number;
}

// Contador de gerações da lista completa (por página; basta ser único).
let listGeneration = 0;

/** Poll do delta com a aba visível (era o do hash: mesmo ritmo, sem a lista inteira atrás). */
const DELTA_POLL_MS = 15_000;
/** Junta numa ida os pedidos em rajada (eventos SSE, agenda, contato novo). O delta é barato: 1 s basta. */
const DELTA_COALESCE_MS = 1_000;
/** Foco/volta à aba não repete um delta que acabou de sair (foco e visibilitychange chegam juntos). */
const DELTA_WAKE_MIN_GAP_MS = 5_000;
// Atraso do coalescer da lista COMPLETA (onDiscarded, lista em erro): cada
// carga são ~1,3 MB e ~5 idas ao banco; duas seguidas por nada é desperdício.
const LIST_REFRESH_COALESCE_MS = 2_000;
// Lista completa como rede de segurança para o que o delta não vê (tique de
// status, mensagem editada, rename de tag, exclusão de contato por outra aba).
const FULL_LIST_REFRESH_MS = 600_000;
// Referência estável para "lista ainda não chegou".
const NO_CONVERSATIONS: WhatsAppConversationDTO[] = [];

const isDocumentHidden = () => typeof document !== 'undefined' && document.hidden;

type ListPatchFn = (list?: WhatsAppConversationDTO[]) => WhatsAppConversationDTO[] | undefined;

/**
 * Lista de conversas (fila, minhas, bot, encerradas), sincronizada por DELTA.
 *
 * Auditoria de 24/09/2026 (B3): a lista baixava as 1.000 conversas (~1,3 MB)
 * a cada mudança do hash de 15 s — no expediente, quase toda janela — em toda
 * aba aberta. Agora:
 * - lista COMPLETA (GET /api/whatsapp/inbox/conversations) só na montagem, a
 *   cada 10 min e quando o delta pede (`full: true`: mais de 300 mudanças ou
 *   aba parada mais de 24 h);
 * - DELTA (GET …?since=<cursor − 5 s>) a cada 15 s com a aba visível, no foco
 *   e por evento: só as conversas que mudaram, fundidas por id
 *   (`mergeConversationDelta`), com o total real de conversas junto. Parado,
 *   quase sempre `items: []`. É fetch manual, não `mutate()`: no SWR 2.3.8 o
 *   mutate apaga a busca em voo e não deduplica. A fusão entra por
 *   `mutate(fn, { revalidate: false })`.
 * O hash (/api/whatsapp/inbox/version) não é mais consultado.
 *
 * Patch otimista × delta: a resposta de um delta lido ANTES do clique chegar ao
 * banco traria o estado velho por cima do otimista (a tag piscava). Por isso
 * `patchConversations(fn, contactId)` e `holdConversation(contactId)` (ação em
 * voo) travam a conversa: o delta não a sobrescreve e o cursor não anda, e ela
 * volta no pedido seguinte já com o que a ação gravou.
 *
 * Portões (`refresh-gate.ts`): `refreshConversations` = delta single-flight
 * (quem faz `await` depois de uma mutação nunca recebe um delta que começou
 * antes dela); `scheduleConversationsRefresh` = delta coalescido (SSE, agenda,
 * contato novo; aba oculta só marca, e a volta à aba já puxa um delta);
 * `reloadAll` = lista completa single-flight ("Tentar novamente", tags
 * editadas).
 *
 * Erro (403 da trava de IP, 500, rede): a lista que já estava na tela FICA e
 * `syncError` diz o motivo (lista completa ou delta). O delta segue tentando a
 * cada 15 s, menos no 401 (sessão vencida), que para até o foco. Delta que
 * volta a funcionar com a lista em erro reagenda a lista completa.
 */
export function useWhatsAppConversations(opts: {
  /**
   * Conversas do delta que já passaram pelas travas, para as cópias fora do
   * SWR (busca no servidor, conversa aberta fora do topo) receberem tag e
   * encerramento. Lido por ref: pode mudar a cada render.
   */
  onDelta?: (items: WhatsAppConversationDTO[]) => void;
} = {}) {
  const onDeltaRef = useRef(opts.onDelta);
  onDeltaRef.current = opts.onDelta;
  const { cache } = useSWRConfig();
  const cachedList = useCallback(
    () => cache.get(INBOX_CONVERSATIONS_URL)?.data as InboxListData | undefined,
    [cache],
  );

  const mutateRef = useRef<KeyedMutator<InboxListData> | null>(null);
  // Criados UMA vez por montagem: se o single-flight fosse recriado a cada
  // render, a proteção sumiria.
  const [fullFlight] = useState(() =>
    createSingleFlight(() => (mutateRef.current ? mutateRef.current() : Promise.resolve(undefined))),
  );
  const runDeltaRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const [deltaFlight] = useState(() => createSingleFlight(() => runDeltaRef.current()));
  const fullCoalescerRef = useRef<Coalescer | null>(null);
  const deltaCoalescerRef = useRef<Coalescer | null>(null);

  // Listas completas em voo (o fetcher conta). Com uma em voo o delta não
  // funde nada: o mutate dele faria o SWR descartar a lista, e ela já traz tudo.
  const fullInFlightRef = useRef(0);
  const fetchFullList = useCallback(async (url: string): Promise<InboxListData> => {
    fullInFlightRef.current += 1;
    try {
      const list = readInboxList(await jsonFetcher<unknown>(url));
      listGeneration += 1;
      return { ...list, gen: listGeneration };
    } finally {
      fullInFlightRef.current -= 1;
    }
  }, []);

  const { data, mutate, isLoading, error } = useSWR<InboxListData>(
    INBOX_CONVERSATIONS_URL,
    fetchFullList,
    {
      refreshInterval: FULL_LIST_REFRESH_MS,
      revalidateOnFocus: false,
      // Sem retry próprio (cada tentativa é a lista inteira): quem tenta de
      // novo é o delta (lista em erro → reagenda) ou o botão "Tentar novamente".
      shouldRetryOnError: false,
      // Um patch local no meio de uma lista completa faz o SWR descartar o
      // resultado dela. Reagenda (coalescido, para não entrar em laço com
      // cliques em sequência).
      onDiscarded: () => fullCoalescerRef.current?.trigger(),
    },
  );
  mutateRef.current = mutate;
  const listErrorRef = useRef<unknown>(undefined);
  listErrorRef.current = error;

  // Cursor do último delta aplicado, amarrado à geração da lista em que ele
  // foi fundido. Fica fora do cache do SWR de propósito: delta vazio (o caso
  // comum) só anda o cursor e não re-renderiza o inbox a cada 15 s.
  const deltaCursorRef = useRef<{ gen: number; cursor: string } | null>(null);
  const cursorOf = (list: InboxListData): string | null => {
    const d = deltaCursorRef.current;
    return d && d.gen === list.gen ? d.cursor : list.cursor;
  };

  // Travas do delta, por contactId (ver `lockedConversationIds`).
  const editsRef = useRef(new Map<string, LocalEdit>());
  const touchEdit = useCallback((contactId: string, pendingDelta: number) => {
    const edits = editsRef.current;
    const prev = edits.get(contactId);
    edits.set(contactId, { at: Date.now(), pending: Math.max(0, (prev?.pending ?? 0) + pendingDelta) });
  }, []);

  const [deltaError, setDeltaError] = useState<unknown>(undefined);
  // 401 no delta = sessão vencida: o poll para até o próximo foco.
  const pausedRef = useRef(false);
  const lastDeltaAtRef = useRef(0);

  runDeltaRef.current = async () => {
    const base = cachedList();
    if (!base) {
      // Sem lista (1ª carga falhou ou não chegou): o que resolve é a lista inteira.
      if (fullInFlightRef.current === 0) await fullFlight.trigger();
      return;
    }
    if (fullInFlightRef.current > 0) return;
    const cursor = cursorOf(base);
    // Servidor sem cursor (deploy anterior ao delta): a lista de 10 min segura.
    if (!cursor) return;

    const startedAt = Date.now();
    lastDeltaAtRef.current = startedAt;
    let res: InboxDeltaResponse;
    try {
      res = readInboxDelta(await jsonFetcher<unknown>(inboxDeltaUrl(sinceWithOverlap(cursor))));
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) pausedRef.current = true;
      setDeltaError(err);
      return;
    }
    setDeltaError(undefined);
    // Delta voltou e a lista completa está em erro (ex.: voltou a rede do
    // escritório): tenta a lista de novo.
    if (listErrorRef.current) fullCoalescerRef.current?.trigger();
    if (res.full) {
      await fullFlight.trigger();
      return;
    }

    const edits = editsRef.current;
    pruneLocalEdits(edits, startedAt);
    const locked = lockedConversationIds(res.items, edits, startedAt);
    const fresh = locked.size ? res.items.filter((c) => !locked.has(c.id)) : res.items;
    // Conversa travada: o cursor fica onde estava e ela volta no próximo delta.
    const nextCursor = locked.size ? null : res.cursor;

    // Lista completa começou no meio do caminho: ela já traz tudo, e um mutate
    // agora faria o SWR descartá-la. O cursor não anda.
    if (fullInFlightRef.current === 0) {
      const cur = cachedList();
      if (cur && cur.gen === base.gen) {
        const total = res.total ?? cur.total;
        if (fresh.length || total !== cur.total) {
          void mutate((list) => {
            if (!list || list.gen !== base.gen) return list;
            const items = fresh.length ? mergeConversationDelta(list.items, fresh, { cap: INBOX_LIST_PAGE }) : list.items;
            return items === list.items && total === list.total ? list : { ...list, items, total };
          }, { revalidate: false });
        }
        if (nextCursor) deltaCursorRef.current = { gen: base.gen, cursor: nextCursor };
      }
    }
    if (fresh.length) onDeltaRef.current?.(fresh);
  };

  // Coalescedores com timer e listener: nascem e morrem no effect (seguro no
  // StrictMode, que monta/desmonta/monta de novo em dev).
  useEffect(() => {
    const full = createCoalescer({
      delayMs: LIST_REFRESH_COALESCE_MS,
      isHidden: isDocumentHidden,
      run: () => fullFlight.trigger(),
    });
    // Oculta, o delta só marca; não precisa do flush: a volta à aba já puxa um.
    const delta = createCoalescer({
      delayMs: DELTA_COALESCE_MS,
      isHidden: isDocumentHidden,
      run: () => deltaFlight.trigger(),
    });
    fullCoalescerRef.current = full;
    deltaCoalescerRef.current = delta;

    const tick = () => {
      if (document.hidden || pausedRef.current) return;
      void deltaFlight.trigger();
    };
    const interval = setInterval(tick, DELTA_POLL_MS);
    const onWake = () => {
      if (document.hidden) return;
      full.flushIfDirty();
      // Foco depois de um 401: o login pode ter sido refeito em outra aba.
      pausedRef.current = false;
      if (Date.now() - lastDeltaAtRef.current < DELTA_WAKE_MIN_GAP_MS) return;
      void deltaFlight.trigger();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      full.dispose();
      delta.dispose();
      if (fullCoalescerRef.current === full) fullCoalescerRef.current = null;
      if (deltaCoalescerRef.current === delta) deltaCoalescerRef.current = null;
    };
  }, [fullFlight, deltaFlight]);

  const refreshConversations = deltaFlight.trigger;
  const reloadAll = fullFlight.trigger;
  const scheduleConversationsRefresh = useCallback(() => deltaCoalescerRef.current?.trigger(), []);

  // Patch local da lista (ação otimista). Sem revalidar: o SWR 2 descarta uma
  // lista completa que começou ANTES deste mutate (traria o estado velho por
  // cima do otimista) e o `onDiscarded` reagenda. Com `contactId`, a conversa
  // fica travada para o delta que já estava em voo (ver acima).
  const patchConversations = useCallback(
    (fn: ListPatchFn, contactId?: string) => {
      if (contactId) touchEdit(contactId, 0);
      // Sem lista no cache: nada a corrigir, e um mutate descartaria a 1ª carga em voo.
      if (!cachedList()) return Promise.resolve(undefined);
      return mutate((list) => {
        if (!list) return list;
        const items = fn(list.items);
        return !items || items === list.items ? list : { ...list, items };
      }, { revalidate: false });
    },
    [mutate, touchEdit, cachedList],
  );

  /**
   * Ação em voo sobre a conversa (assumir, encerrar, tag, marcar lida): o
   * delta não a sobrescreve até o `release` (chame no `finally`). Sem isso, um
   * delta lido entre o clique e o commit da action desfazia o otimista por
   * alguns segundos.
   */
  const holdConversation = useCallback((contactId: string): (() => void) => {
    touchEdit(contactId, 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      touchEdit(contactId, -1);
    };
  }, [touchEdit]);

  // "Tentar de novo" do aviso de lista sem atualizar: lista completa se foi
  // ela que falhou; senão, o delta.
  const retrySync = useCallback(() => {
    pausedRef.current = false;
    return listErrorRef.current ? fullFlight.trigger().then(() => undefined) : deltaFlight.trigger();
  }, [fullFlight, deltaFlight]);

  // `loaded` separa "a lista chegou e está vazia" de "ainda não chegou" — o
  // `conversations` abaixo é [] nos dois casos. A tela decide entre esqueleto,
  // erro com "Tentar novamente" e "Nenhuma conversa ainda" por
  // `inboxListState` (app/_shared/utils/whatsapp-inbox.ts). `syncError` = a
  // lista na tela pode estar velha (a lista completa ou o delta falharam).
  // `total` = conversas no BANCO (a lista é capada em 1.000), vindo com a
  // lista e com cada delta.
  return {
    conversations: data?.items ?? NO_CONVERSATIONS, loaded: data !== undefined, total: data?.total ?? 0,
    refreshConversations, reloadAll, scheduleConversationsRefresh, patchConversations, holdConversation,
    isLoading, error, syncError: (error ?? deltaError) as unknown, retrySync,
  };
}

// Tamanho de cada bloco ao "carregar mensagens anteriores".
const OLDER_PAGE_SIZE = 30;
// Janela das recentes (o SWR abaixo pede limit=50).
const RECENT_LIMIT = 50;
// Referência estável para "sem mensagens" (a janela compara por referência).
const EMPTY_THREAD: WhatsAppThreadMessage[] = [];

/** Estado da janela da thread de UMA conversa (ver thread-window.ts). */
interface ThreadWindowState {
  contactId: string | null;
  /** Mensagens anteriores ao recent: blocos de "Carregar anteriores" + as que deslizaram para fora da janela. */
  older: WhatsAppThreadMessage[];
  /** Último recent já conciliado com o older (mesma referência do SWR). */
  prevRecent: WhatsAppThreadMessage[];
  /** true a partir do 1º "Carregar anteriores" desta conversa. */
  historyOpen: boolean;
  /** Com o histórico aberto, quem diz se ainda há mais é a resposta do before=. */
  olderHasMore: boolean;
  /**
   * Busca de "Carregar anteriores" em voo (null = nenhuma). A resposta só vale
   * se o token ainda for o mesmo: sair e voltar à conversa zera a janela, e o
   * bloco pedido antes não pode cair no estado novo.
   */
  loadToken: object | null;
}

function emptyThreadWindow(contactId: string | null): ThreadWindowState {
  return { contactId, older: EMPTY_THREAD, prevRecent: EMPTY_THREAD, historyOpen: false, olderHasMore: false, loadToken: null };
}

type ThreadData = { messages: WhatsAppThreadMessage[]; hasMore?: boolean };

/** Key do SWR das recentes de uma conversa (o upsert do envio mira a mesma entrada). */
function threadKey(contactId: string): string {
  return `/api/whatsapp/messages?contactId=${encodeURIComponent(contactId)}&limit=${RECENT_LIMIT}`;
}

/**
 * Mensagens de uma conversa. As MAIS RECENTES vêm por SWR (polling 8s + SSE
 * chama mutate ao chegar algo). As ANTIGAS são carregadas sob demanda em blocos
 * (loadOlder) e acumuladas no client — economiza busca no banco e mantém a
 * thread leve, sem puxar toda a conversa de uma vez.
 *
 * Polling de 8s SÓ aqui (thread ABERTA — uma por vez, rota leve por contactId):
 * é a rede de segurança quando o SSE do relay cai (hoje ele não entrega em
 * produção). A LISTA de conversas tem o poll próprio do delta (15 s, só as
 * conversas que mudaram; ver useWhatsAppConversations).
 *
 * Janela deslizante (auditoria de 24/09/2026, THR-5): cada mensagem nova tira
 * a mais antiga das 50 recentes. Com o histórico aberto, ela ia para um buraco
 * entre o older e o recent e sumia da tela; agora vai para o older
 * (`mergeThreadWindow`). E o botão "Carregar anteriores", que o poll religava
 * a cada 8 s mesmo depois do início da conversa, passa a obedecer só à
 * resposta do before= depois do 1º clique.
 *
 * Erro (403 da trava de IP, 500, rede): o SWR guarda o `error` e MANTÉM as
 * mensagens que já estavam na tela; a thread mostra o aviso. Com erro
 * guardado o refreshInterval não busca (swr 2.3.8) — quem traz a thread de
 * volta é a nova tentativa (`pollRetryDelayMs`, no máximo a cada 30 s) ou o
 * foco da aba.
 */
export function useWhatsAppMessages(contactId: string | null) {
  // `isLoading` (1ª carga desta conversa, sem nada em cache) vira o spinner da
  // thread — sem ele, abrir uma conversa não visitada mostrava a tela vazia.
  const { data, mutate, isLoading, error } = useSWR<ThreadData>(
    contactId ? threadKey(contactId) : null,
    (url: string) => jsonFetcher<ThreadData>(url),
    {
      // 8s (era 5s): o SSE do relay já entrega a mensagem na hora; este poll é
      // só a rede de segurança e o refresh dos ticks de status/reações.
      refreshInterval: 8_000,
      revalidateOnFocus: true,
      onErrorRetry: (err, _key, _config, revalidate, opts) => {
        const delay = pollRetryDelayMs(err, opts.retryCount);
        if (delay !== null) setTimeout(() => { void revalidate(opts); }, delay);
      },
    },
  );

  // Defesa: resposta 2xx sem `messages` (não deveria acontecer) vira lista
  // vazia em vez de quebrar a thread.
  const recent = useMemo(
    () => (Array.isArray(data?.messages) ? data.messages : EMPTY_THREAD),
    [data],
  );

  const [win, setWin] = useState<ThreadWindowState>(() => emptyThreadWindow(contactId));

  // Conciliação NO RENDER (padrão do React "guardar informação do render
  // anterior"), não num useEffect: o efeito rodaria depois do commit, e a
  // mensagem que saiu da janela ficaria 1 frame fora da tela antes de voltar
  // pelo older. O setWin aqui refaz o render na hora, antes de pintar.
  // Troca de conversa zera tudo (older, recent anterior, histórico aberto e
  // carga em voo da conversa anterior).
  let view = win.contactId === contactId ? win : emptyThreadWindow(contactId);
  if (view.prevRecent !== recent) {
    view = {
      ...view,
      older: mergeThreadWindow(view.older, view.prevRecent, recent, { historyOpen: view.historyOpen }),
      prevRecent: recent,
    };
  }
  if (view !== win) setWin(view);

  const messages = useMemo(() => unionThreadMessages(view.older, recent), [view.older, recent]);
  // Antes do 1º "Carregar anteriores": há mais se o recent veio cheio (50;
  // 51 logo depois de um envio). Depois dele: só a resposta do before= manda —
  // o poll não religa o botão quando o início da conversa já chegou.
  const hasMore = view.historyOpen ? view.olderHasMore : recent.length >= RECENT_LIMIT;
  const loadingOlder = view.loadToken !== null;

  const loadOlder = useCallback(async () => {
    if (!contactId || loadingOlder || !hasMore) return;
    const oldest = messages[0];
    if (!oldest) return;
    const cid = contactId;
    const token = {};
    // historyOpen já no clique: o que deslizar enquanto o bloco não chega
    // também vai para o older. olderHasMore começa true: se a busca falhar, o
    // botão continua lá e um clique a mais tenta de novo.
    setWin((prev) => (prev.contactId === cid
      ? { ...prev, loadToken: token, historyOpen: true, olderHasMore: true }
      : prev));
    try {
      const json = await jsonFetcher<Partial<ThreadData>>(
        `/api/whatsapp/messages?contactId=${encodeURIComponent(cid)}`
          + `&before=${encodeURIComponent(oldest.createdAt)}&limit=${OLDER_PAGE_SIZE}`,
      );
      if (!Array.isArray(json.messages)) throw new Error('falha ao carregar anteriores');
      const batch = json.messages;
      // Resposta de uma janela que já foi zerada (troca de conversa) é descartada.
      setWin((prev) => (prev.loadToken === token
        ? {
          ...prev,
          older: unionThreadMessages(prev.older, batch),
          olderHasMore: !!json.hasMore && batch.length > 0,
          loadToken: null,
        }
        : prev));
    } catch {
      // silencioso: o botão continua e um clique a mais tenta de novo
      setWin((prev) => (prev.loadToken === token ? { ...prev, loadToken: null } : prev));
    }
  }, [contactId, loadingOlder, hasMore, messages]);

  // Mensagem recém-enviada direto no cache da thread, sem refetch (THR-10: a
  // bolha otimista sai no mesmo render em que a real entra). Por key
  // EXPLÍCITA, não pelo `mutate` do useSWR acima: aquele mira a key ATUAL (o
  // SWR guarda a key num ref) — se o atendente trocou de conversa durante o
  // envio, a mensagem entraria na thread de outro cliente.
  const { mutate: mutateCache } = useSWRConfig();
  const upsertThreadMessage = useCallback((cid: string, msg: WhatsAppThreadMessage) => {
    void mutateCache<ThreadData>(
      threadKey(cid),
      (cur) => (cur && Array.isArray(cur.messages) ? { ...cur, messages: upsertById(cur.messages, msg) } : cur),
      { revalidate: false },
    );
  }, [mutateCache]);
  // Revalidação de fundo da conversa do envio (completa transcrição, reação e
  // ticks que o DTO não traz). Conversa que já não está aberta só atualiza
  // quando for reaberta.
  const revalidateThread = useCallback((cid: string) => mutateCache(threadKey(cid)), [mutateCache]);

  return { messages, mutate, isLoading, error: error as unknown, loadOlder, hasMore, loadingOlder, upsertThreadMessage, revalidateThread };
}

/** Tentativas depois de erro (403 da trava de IP, 500, rede): 5 s, 10 s e 20 s, e para. */
const CONTACT_FILES_MAX_RETRIES = 3;

const CONTACT_FILES_SWR: SWRInfiniteConfiguration<ContactFilesPage<unknown>> = {
  // Sem poll e sem foco: quem busca de novo é a tela — mídia nova na janela
  // da thread (o poll de 8 s dela já roda), lista de documentos que mudou
  // (anexar, excluir) e a reabertura da aba (a 1ª página é revalidada ao
  // montar; as seguintes são refeitas se o cursor mudar).
  revalidateOnFocus: false,
  onErrorRetry: (err, _key, _config, revalidate, opts) => {
    // 404 = contato excluído em outra aba: tentar de novo não resolve.
    if (err instanceof HttpError && err.status === 404) return;
    if (opts.retryCount > CONTACT_FILES_MAX_RETRIES) return;
    const delay = pollRetryDelayMs(err, opts.retryCount);
    if (delay !== null) setTimeout(() => { void revalidate(opts); }, delay);
  },
};

const fetchContactFilesPage = (url: string) => jsonFetcher<unknown>(url).then((b) => readContactFilesPage<never>(b));

export type ContactFilesQueryInput =
  | { kind: 'media'; direction: ContactFileDirection; onlyUnattached?: boolean }
  | { kind: 'notes' };

export interface ContactFilesState<T> {
  items: T[];
  /** Há páginas mais antigas ainda não carregadas. */
  hasMore: boolean;
  /** Mídias fora do card no filtro de direção (1ª página); null em notas ou antes de chegar. */
  unattachedCount: number | null;
  /** 1ª carga, sem nada em cache. */
  isLoading: boolean;
  /** Falha da última busca (403 da trava de IP, 500, rede); os itens já carregados continuam. */
  error: unknown;
  loadingMore: boolean;
  loadMore: () => void;
  /** Busca de novo todas as páginas carregadas. */
  reload: () => Promise<unknown>;
}

/**
 * Mídias ou notas de TODA a conversa do contato (GET
 * /api/whatsapp/inbox/contact-files), em páginas do mais novo para o mais
 * antigo com "carregar mais" pelo cursor. A thread traz só as 50 mensagens
 * mais recentes, e 31% dos documentos do cliente ficavam fora dela.
 * `enabled` false (ou contactId null) não busca: a aba Arquivos só consulta
 * quando está aberta, e as notas só quando a aba Notas (ou o motivo da fila)
 * precisa delas.
 */
export function useWhatsAppContactFiles(
  contactId: string | null,
  query: { kind: 'media'; direction: ContactFileDirection; onlyUnattached?: boolean },
  enabled?: boolean,
): ContactFilesState<ContactMediaItem>;
export function useWhatsAppContactFiles(
  contactId: string | null,
  query: { kind: 'notes' },
  enabled?: boolean,
): ContactFilesState<ContactNoteItem>;
export function useWhatsAppContactFiles(
  contactId: string | null,
  query: ContactFilesQueryInput,
  enabled = true,
): ContactFilesState<ContactMediaItem | ContactNoteItem> {
  type Item = ContactMediaItem | ContactNoteItem;
  const kind = query.kind;
  const direction = query.kind === 'media' ? query.direction : undefined;
  const onlyUnattached = query.kind === 'media' ? !!query.onlyUnattached : false;

  const getKey = useCallback((index: number, prev: ContactFilesPage<Item> | null) => {
    if (!contactId || !enabled) return null;
    if (index === 0) return contactFilesUrl({ contactId, kind, direction, onlyUnattached });
    const cursor = nextPageCursor(prev);
    return cursor ? contactFilesUrl({ contactId, kind, direction, onlyUnattached, ...cursor }) : null;
  }, [contactId, enabled, kind, direction, onlyUnattached]);

  const { data, error, isLoading, size, setSize, mutate } = useSWRInfinite<ContactFilesPage<Item>>(
    getKey,
    fetchContactFilesPage,
    CONTACT_FILES_SWR as SWRInfiniteConfiguration<ContactFilesPage<Item>>,
  );

  const items = useMemo(() => flattenPages(data), [data]);
  const hasMore = !!data?.[data.length - 1]?.hasMore;
  const loadingMore = !error && size > 1 && !!data && data[size - 1] === undefined;
  const loadMore = useCallback(() => { void setSize((s) => s + 1); }, [setSize]);
  const reload = useCallback(() => mutate(), [mutate]);

  return {
    items,
    hasMore,
    unattachedCount: data?.[0]?.unattachedCount ?? null,
    isLoading,
    error: error as unknown,
    loadingMore,
    loadMore,
    reload,
  };
}

/** Chave SWR das linhas da empresa: a MESMA em todo seletor de número, para dividir o cache. */
export const WA_NUMBER_OPTIONS_KEY = 'wa-number-options';
export type WaNumberOption = Awaited<ReturnType<typeof listWaNumberOptions>>[number];

/**
 * Linhas ativas da empresa (seletor de número, etiqueta da linha na lista e
 * teto da recuperação por número). Pelo cache global do SWR: a nova-dash
 * desmonta o inbox a cada troca de aba, e voltar ao WhatsApp mostra as linhas
 * na hora, sem pôr a action de novo na fila serial na frente do 1º clique.
 * Remontar dentro de 60 s não busca; depois disso busca em segundo plano.
 * `undefined` = ainda não chegou (ou falhou): quem restaura um filtro salvo
 * espera as opções chegarem.
 */
export function useWaNumberOptions(): WaNumberOption[] | undefined {
  const { data } = useSWR<WaNumberOption[]>(
    WA_NUMBER_OPTIONS_KEY,
    () => listWaNumberOptions(),
    { revalidateOnFocus: false, dedupingInterval: 60_000, shouldRetryOnError: false },
  );
  return data;
}

/**
 * Colunas do Kanban do filtro do inbox (GET /api/whatsapp/inbox/columns),
 * com a contagem real de conversas por coluna. Cache global do SWR como as
 * linhas: voltar ao WhatsApp dentro de 60 s não busca de novo. `columns`
 * undefined = ainda não chegou; `failed` = a busca falhou (sem retry
 * automático; o menu tem "Tentar novamente").
 */
export function useInboxColumns(): { columns: InboxColumnOption[] | undefined; failed: boolean; reload: () => void } {
  const { data, error, isValidating, mutate } = useSWR<InboxColumnOption[]>(
    INBOX_COLUMNS_URL,
    async (url: string) => readInboxColumns(await jsonFetcher<unknown>(url)),
    { revalidateOnFocus: false, dedupingInterval: 60_000, shouldRetryOnError: false },
  );
  const reload = useCallback(() => { void mutate(); }, [mutate]);
  return { columns: data, failed: !!error && !isValidating, reload };
}

// O badge de não lidas das abas não mora mais aqui: vem de GET
// /api/team/badges (`whatsappUnread`, hook use-header-badges.ts), junto com os
// outros avisos do cabeçalho, numa ida só a cada 30 s.

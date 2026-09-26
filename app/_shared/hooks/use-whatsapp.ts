'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { useSWRConfig, type KeyedMutator } from 'swr';
// SÓ tipos (`import type`): inbox-data.ts, ao lado, importa o Prisma e não
// pode entrar no bundle do navegador.
import type { InboxVersionResponse, WhatsAppConversationDTO } from '@/app/_shared/lib/whatsapp/inbox-types';
import { listWaNumberOptions } from '@/app/_actions/whatsapp/numbers';
import { createCoalescer, createSingleFlight, type Coalescer } from '@/app/_shared/utils/refresh-gate';
import { mergeThreadWindow, unionThreadMessages, upsertById } from '@/app/_shared/utils/thread-window';
import { jsonFetcher, pollRetryDelayMs } from '@/app/_shared/utils/fetch-json';
import {
  INBOX_CONVERSATIONS_URL, INBOX_VERSION_URL, inboxConversationUrl, inboxSearchUrl,
  readInboxItem, readInboxItems, readInboxVersion,
} from '@/app/_shared/utils/inbox-api';

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
// não-ok LANÇA. As rotas (thread, lista, versão, busca) decidem o acesso pelo
// banco + trava de IP (`teamRoute`) e podem responder 403 (atendente mudou de
// rede com a aba aberta) ou 500 (banco); com um fetcher que não olha o status
// isso viraria dado e esvaziaria a tela. O SWR guarda o erro e mantém o
// último dado bom.
//
// Lista, versão e busca são GET, não server actions (auditoria de 24/09/2026,
// FE-1): as actions de uma aba saem numa fila SERIAL, e a recarga da lista e o
// hash de 15 s seguravam o clique do atendente (tag, assumir, encerrar). A
// fila de actions agora fica só com mutações.

/** Lista do inbox pela rota GET (lança em resposta não-ok ou fora do formato). */
const fetchConversationList = (url: string) => jsonFetcher<unknown>(url).then(readInboxItems);
/** Hash + total pela rota GET (a mesma key é lida pelos dois hooks abaixo). */
const fetchInboxVersion = (url: string) => jsonFetcher<unknown>(url).then(readInboxVersion);

/** Busca em TODO o histórico (GET, fora da fila de actions). Lança `HttpError` na falha. */
export async function fetchInboxSearch(term: string): Promise<WhatsAppConversationDTO[]> {
  return readInboxItems(await jsonFetcher<unknown>(inboxSearchUrl(term)));
}

/** UMA conversa pelo contato (abrir fora do topo da lista); `null` = contato sem conversa. */
export async function fetchInboxConversation(contactId: string): Promise<WhatsAppConversationDTO | null> {
  return readInboxItem(await jsonFetcher<unknown>(inboxConversationUrl(contactId)));
}

// Atraso do coalescer da lista: junta numa carga só os pedidos que chegam em
// rajada (hash que mudou, eventos SSE, onDiscarded). A lista não disputa mais
// a fila de server actions com o clique (é GET), mas cada carga ainda são
// ~1,3 MB e ~5 idas ao banco: duas cargas seguidas por nada é desperdício.
const LIST_REFRESH_COALESCE_MS = 2_000;

const isDocumentHidden = () => typeof document !== 'undefined' && document.hidden;

/**
 * Lista de conversas (fila, minhas, bot, encerradas).
 *
 * O que roda a cada 15s é GET /api/whatsapp/inbox/version (um hash de umas 4
 * agregações + o total, ~4 ms no banco); a lista completa (até 1.000
 * conversas hidratadas, GET /api/whatsapp/inbox/conversations) só é rebuscada
 * quando o hash muda, depois de uma ação, por evento SSE ou pela rede de
 * segurança de 10 min.
 *
 * Auditoria de 24/09/2026 — por que o foco NÃO recarrega a lista: ~17% das
 * cargas completas vinham só de voltar à janela (alt-tab do WhatsApp Web), na
 * frente do primeiro clique. No foco só o hash (barato) é consultado, e ele
 * decide. Limitação conhecida: voltar de aba OCULTA ainda recarrega a lista
 * inteira se o hash mudou nesse meio tempo (o SWR não faz poll com a aba
 * oculta) — resolve na sincronização por delta.
 *
 * Toda recarga passa pelos portões de `refresh-gate.ts`, porque o mutate() do
 * SWR não deduplica (cada chamada descarta a busca em voo e começa outra):
 * - `refreshConversations` (single-flight): para quem faz `await` depois de
 *   uma mutação; nunca devolve uma carga que começou antes do pedido.
 * - `scheduleConversationsRefresh` (coalescer de 2s sobre o single-flight):
 *   para gatilhos automáticos (hash, SSE, onDiscarded). Com a aba oculta só
 *   marca e recarrega uma vez quando ela volta a ficar visível.
 *
 * Erro (403 da trava de IP, 500, rede): a lista que já estava na tela FICA (o
 * SWR guarda o último dado) e `syncError` diz o motivo, para a tela avisar
 * "lista sem atualizar". Com erro guardado o SWR não faz o poll de intervalo:
 * o hash volta pelo `onErrorRetry` (5 s, 10 s, 20 s, depois 30 s; 401 para), e
 * cada hash que chega com a lista em erro reagenda a carga — sem isso a lista
 * só voltaria no próximo hash DIFERENTE.
 */
export function useWhatsAppConversations() {
  const mutateRef = useRef<KeyedMutator<WhatsAppConversationDTO[]> | null>(null);
  // Criado UMA vez por montagem: se o single-flight fosse recriado a cada
  // render, a proteção sumiria.
  const [flight] = useState(() =>
    createSingleFlight(() => (mutateRef.current ? mutateRef.current() : Promise.resolve(undefined))),
  );
  const coalescerRef = useRef<Coalescer | null>(null);

  const { data, mutate, isLoading, error } = useSWR<WhatsAppConversationDTO[]>(
    INBOX_CONVERSATIONS_URL,
    fetchConversationList,
    {
      // Rede de segurança para mudança que o hash não captura (ex.: nome do
      // card editado no Kanban). Era 2 min + foco; no expediente o hash muda
      // em ~55% das janelas de 15s, então na prática a lista anda em segundos.
      refreshInterval: 600_000,
      revalidateOnFocus: false,
      // Sem retry próprio (cada tentativa é a lista inteira): quem tenta de
      // novo é o hash (onSuccess abaixo) ou o botão "Tentar novamente".
      shouldRetryOnError: false,
      // Um patch local (mutate com revalidate:false) no meio de uma carga faz
      // o SWR descartar o resultado dela — e o hash já avançou, então a
      // mudança de OUTRA conversa só voltaria em até 10 min. Reagenda uma
      // carga (coalescida, para não entrar em laço com cliques em sequência).
      onDiscarded: () => coalescerRef.current?.trigger(),
    },
  );
  mutateRef.current = mutate;
  const listErrorRef = useRef<unknown>(undefined);
  listErrorRef.current = error;

  // O coalescer tem timer e listener: nasce e morre no effect (seguro no
  // StrictMode, que monta/desmonta/monta de novo em dev).
  useEffect(() => {
    const coalescer = createCoalescer({
      delayMs: LIST_REFRESH_COALESCE_MS,
      isHidden: isDocumentHidden,
      run: () => flight.trigger(),
    });
    coalescerRef.current = coalescer;
    const onVisibility = () => {
      if (!document.hidden) coalescer.flushIfDirty();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      coalescer.dispose();
      if (coalescerRef.current === coalescer) coalescerRef.current = null;
    };
  }, [flight]);

  const refreshConversations = flight.trigger;
  const scheduleConversationsRefresh = useCallback(() => coalescerRef.current?.trigger(), []);
  // Patch local da lista (ação otimista: tag, e as próximas da onda). Sem
  // revalidar: o SWR 2 descarta uma carga que começou ANTES deste mutate — ela
  // traria o estado velho por cima do otimista — e o `onDiscarded` acima
  // reagenda a recarga descartada.
  const patchConversations = useCallback(
    (fn: (list?: WhatsAppConversationDTO[]) => WhatsAppConversationDTO[] | undefined) =>
      mutate(fn, { revalidate: false }),
    [mutate],
  );

  const { data: versionData, error: versionError, mutate: mutateVersion } = useSWR<InboxVersionResponse>(
    INBOX_VERSION_URL,
    fetchInboxVersion,
    {
      // Foco revalida SÓ o hash: se nada mudou, a lista fica como está.
      refreshInterval: 15_000,
      revalidateOnFocus: true,
      onErrorRetry: (err, _key, _config, revalidate, opts) => {
        const delay = pollRetryDelayMs(err, opts.retryCount);
        if (delay !== null) setTimeout(() => { void revalidate(opts); }, delay);
      },
      // Hash chegou e a lista está em erro (ex.: voltou a rede do escritório):
      // tenta a lista de novo mesmo que o hash não tenha mudado.
      onSuccess: () => {
        if (listErrorRef.current) coalescerRef.current?.trigger();
      },
    },
  );
  const version = versionData?.version;
  const lastVersion = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!version) return;
    if (lastVersion.current !== undefined && lastVersion.current !== version) scheduleConversationsRefresh();
    lastVersion.current = version;
  }, [version, scheduleConversationsRefresh]);

  // "Tentar de novo" do aviso de lista sem atualizar: a falha pode ser da
  // lista OU do hash, então os dois voltam juntos.
  const retrySync = useCallback(() => {
    void mutateVersion();
    return flight.trigger();
  }, [mutateVersion, flight]);

  // `loaded` separa "a lista chegou e está vazia" de "ainda não chegou" — o
  // `conversations` abaixo é [] nos dois casos. A tela decide entre esqueleto,
  // erro com "Tentar novamente" e "Nenhuma conversa ainda" por
  // `inboxListState` (app/_shared/utils/whatsapp-inbox.ts). `syncError` = a
  // lista na tela pode estar velha (a carga ou o hash falharam).
  return {
    conversations: data ?? [], loaded: data !== undefined,
    refreshConversations, scheduleConversationsRefresh, patchConversations, isLoading, error,
    syncError: (error ?? versionError) as unknown, retrySync,
  };
}

/**
 * Total REAL de conversas (badge do topo da lista do inbox). A lista é capada
 * em 1.000 (`LIST_PAGE`) pelo servidor — contar conversations.length
 * "estagnaria" no teto. Vem junto do hash (mesma query, mesma key do SWR):
 * sem poll próprio — quem busca a cada 15 s é o `useWhatsAppConversations`.
 */
export function useWhatsAppConversationsTotal() {
  const { data } = useSWR<InboxVersionResponse>(
    INBOX_VERSION_URL,
    fetchInboxVersion,
    { refreshInterval: 0, revalidateOnFocus: false, revalidateIfStale: false, shouldRetryOnError: false },
  );
  return data?.total ?? 0;
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
 * produção). A LISTA de conversas não faz poll próprio: só o hash de 15s, e a
 * lista pesada recarrega quando ele muda (ver useWhatsAppConversations).
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

// O badge de não lidas das abas não mora mais aqui: vem de GET
// /api/team/badges (`whatsappUnread`, hook use-header-badges.ts), junto com os
// outros avisos do cabeçalho, numa ida só a cada 30 s.

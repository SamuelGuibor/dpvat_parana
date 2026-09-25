'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { useSWRConfig, type KeyedMutator } from 'swr';
import {
  listWhatsAppConversations,
  getWhatsAppInboxVersion,
  countWhatsAppUnread,
  countWhatsAppConversationsTotal,
  type WhatsAppConversationDTO,
} from '@/app/_actions/whatsapp/conversations';
import { createCoalescer, createSingleFlight, type Coalescer } from '@/app/_shared/utils/refresh-gate';
import { mergeThreadWindow, unionThreadMessages, upsertById } from '@/app/_shared/utils/thread-window';

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

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());

// Atraso do coalescer da lista: junta numa carga só os pedidos que chegam em
// rajada (hash que mudou, eventos SSE, onDiscarded) e deixa o clique do
// atendente entrar na fila de server actions antes da recarga pesada.
const LIST_REFRESH_COALESCE_MS = 2_000;

const isDocumentHidden = () => typeof document !== 'undefined' && document.hidden;

/**
 * Lista de conversas (fila, minhas, bot, encerradas).
 *
 * O que roda a cada 15s é `getWhatsAppInboxVersion` (um hash de umas 4
 * agregações); a lista completa (até 1.000 conversas hidratadas) só é
 * rebuscada quando o hash muda, depois de uma ação, por evento SSE ou pela
 * rede de segurança de 10 min.
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
    'whatsapp-conversations',
    () => listWhatsAppConversations(),
    {
      // Rede de segurança para mudança que o hash não captura (ex.: nome do
      // card editado no Kanban). Era 2 min + foco; no expediente o hash muda
      // em ~55% das janelas de 15s, então na prática a lista anda em segundos.
      refreshInterval: 600_000,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      // Um patch local (mutate com revalidate:false) no meio de uma carga faz
      // o SWR descartar o resultado dela — e o hash já avançou, então a
      // mudança de OUTRA conversa só voltaria em até 10 min. Reagenda uma
      // carga (coalescida, para não entrar em laço com cliques em sequência).
      onDiscarded: () => coalescerRef.current?.trigger(),
    },
  );
  mutateRef.current = mutate;

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

  const { data: version } = useSWR<string>(
    'whatsapp-inbox-version',
    () => getWhatsAppInboxVersion(),
    // Foco revalida SÓ o hash: se nada mudou, a lista fica como está.
    { refreshInterval: 15_000, revalidateOnFocus: true, shouldRetryOnError: false },
  );
  const lastVersion = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!version) return;
    if (lastVersion.current !== undefined && lastVersion.current !== version) scheduleConversationsRefresh();
    lastVersion.current = version;
  }, [version, scheduleConversationsRefresh]);

  // `loaded` separa "a lista chegou e está vazia" de "ainda não chegou" — o
  // `conversations` abaixo é [] nos dois casos. A tela decide entre esqueleto,
  // erro com "Tentar novamente" e "Nenhuma conversa ainda" por
  // `inboxListState` (app/_shared/utils/whatsapp-inbox.ts).
  return {
    conversations: data ?? [], loaded: data !== undefined,
    refreshConversations, scheduleConversationsRefresh, patchConversations, isLoading, error,
  };
}

/**
 * Total REAL de conversas (badge do topo da lista do inbox). A lista é capada
 * em 1.000 (`LIST_PAGE`) pelo servidor — contar conversations.length
 * "estagnaria" no teto. Count barato: sem recarga no foco, 5 min basta.
 */
export function useWhatsAppConversationsTotal() {
  const { data } = useSWR<number>(
    'whatsapp-conversations-total',
    () => countWhatsAppConversationsTotal(),
    { refreshInterval: 300_000, revalidateOnFocus: false, shouldRetryOnError: false },
  );
  return data ?? 0;
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
 */
export function useWhatsAppMessages(contactId: string | null) {
  // `isLoading` (1ª carga desta conversa, sem nada em cache) vira o spinner da
  // thread — sem ele, abrir uma conversa não visitada mostrava a tela vazia.
  const { data, mutate, isLoading } = useSWR<ThreadData>(
    contactId ? threadKey(contactId) : null,
    fetcher,
    // 8s (era 5s): o SSE do relay já entrega a mensagem na hora; este poll é
    // só a rede de segurança e o refresh dos ticks de status/reações.
    { refreshInterval: 8_000, revalidateOnFocus: true },
  );

  // O fetcher não olha o status: um 401/403/500 chega como `{ error }`, sem
  // `messages`. Vira lista vazia em vez de quebrar a thread.
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
      const res = await fetch(
        `/api/whatsapp/messages?contactId=${encodeURIComponent(cid)}`
          + `&before=${encodeURIComponent(oldest.createdAt)}&limit=${OLDER_PAGE_SIZE}`,
        { cache: 'no-store' },
      );
      const json = (await res.json()) as { messages?: WhatsAppThreadMessage[]; hasMore?: boolean };
      if (!res.ok || !Array.isArray(json.messages)) throw new Error('falha ao carregar anteriores');
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

  return { messages, mutate, isLoading, loadOlder, hasMore, loadingOlder, upsertThreadMessage, revalidateThread };
}

/**
 * Total de conversas não lidas (badge das abas). Usa a action de CONTAGEM
 * leve em vez de hidratar as 200 conversas — o badge montava a query mais
 * pesada do app a cada 15s mesmo com o inbox fechado.
 *
 * Sem recarga no foco (auditoria de 24/09/2026): server actions saem numa
 * fila serial por aba, e voltar à janela enfileirava esta contagem na frente
 * do primeiro clique. O poll de 30 s basta para o badge.
 */
export function useWhatsAppUnread() {
  const { data } = useSWR<number>(
    'whatsapp-unread-count',
    () => countWhatsAppUnread(),
    { refreshInterval: 30_000, revalidateOnFocus: false, shouldRetryOnError: false },
  );
  return data ?? 0;
}

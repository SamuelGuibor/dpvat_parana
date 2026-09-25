'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useSWR, { type KeyedMutator } from 'swr';
import {
  listWhatsAppConversations,
  getWhatsAppInboxVersion,
  countWhatsAppUnread,
  countWhatsAppConversationsTotal,
  type WhatsAppConversationDTO,
} from '@/app/_actions/whatsapp/conversations';
import { createCoalescer, createSingleFlight, type Coalescer } from '@/app/_shared/utils/refresh-gate';

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

  return { conversations: data ?? [], refreshConversations, scheduleConversationsRefresh, isLoading, error };
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
 */
export function useWhatsAppMessages(contactId: string | null) {
  const { data, mutate, isLoading } = useSWR<{ messages: WhatsAppThreadMessage[]; hasMore?: boolean }>(
    contactId ? `/api/whatsapp/messages?contactId=${encodeURIComponent(contactId)}&limit=50` : null,
    fetcher,
    // 8s (era 5s): o SSE do relay já entrega a mensagem na hora; este poll é
    // só a rede de segurança e o refresh dos ticks de status/reações.
    { refreshInterval: 8_000, revalidateOnFocus: true },
  );

  const recent = useMemo(() => data?.messages ?? [], [data]);

  const [older, setOlder] = useState<WhatsAppThreadMessage[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Só há blocos anteriores se o 1º carregamento já veio "cheio" (50 msgs).
  const [hasMore, setHasMore] = useState(false);

  // Troca de conversa → zera os blocos antigos acumulados.
  useEffect(() => {
    setOlder([]);
    setLoadingOlder(false);
  }, [contactId]);

  // Alinha o hasMore com a resposta do SWR das recentes (menos de 50 = sem mais).
  useEffect(() => {
    if (data) setHasMore(data.messages.length >= 50);
  }, [data]);

  const messages = useMemo(() => [...older, ...recent], [older, recent]);

  const loadOlder = useCallback(async () => {
    if (!contactId || loadingOlder || !hasMore) return;
    const oldest = messages[0];
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(
        `/api/whatsapp/messages?contactId=${encodeURIComponent(contactId)}`
          + `&before=${encodeURIComponent(oldest.createdAt)}&limit=${OLDER_PAGE_SIZE}`,
        { cache: 'no-store' },
      );
      const json = (await res.json()) as { messages: WhatsAppThreadMessage[]; hasMore?: boolean };
      const batch = json.messages ?? [];
      setOlder((prev) => [...batch, ...prev]);
      setHasMore(!!json.hasMore && batch.length > 0);
    } catch {
      // silencioso: um clique a mais no botão tenta de novo
    } finally {
      setLoadingOlder(false);
    }
  }, [contactId, loadingOlder, hasMore, messages]);

  return { messages, mutate, isLoading, loadOlder, hasMore, loadingOlder };
}

/**
 * Total de conversas não lidas (badge das abas). Usa a action de CONTAGEM
 * leve em vez de hidratar as 200 conversas — o badge montava a query mais
 * pesada do app a cada 15s mesmo com o inbox fechado.
 */
export function useWhatsAppUnread() {
  const { data } = useSWR<number>(
    'whatsapp-unread-count',
    () => countWhatsAppUnread(),
    { refreshInterval: 30_000, revalidateOnFocus: true, shouldRetryOnError: false },
  );
  return data ?? 0;
}

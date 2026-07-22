'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  listWhatsAppConversations,
  countWhatsAppUnread,
  type WhatsAppConversationDTO,
} from '@/app/_actions/whatsapp/conversations';

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
}

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());

/** Lista de conversas (fila, minhas, bot, encerradas). Polling de 15s. */
export function useWhatsAppConversations() {
  const { data, mutate, isLoading, error } = useSWR<WhatsAppConversationDTO[]>(
    'whatsapp-conversations',
    () => listWhatsAppConversations(),
    { refreshInterval: 15_000, revalidateOnFocus: true, shouldRetryOnError: false },
  );
  return { conversations: data ?? [], refreshConversations: mutate, isLoading, error };
}

// Tamanho de cada bloco ao "carregar mensagens anteriores".
const OLDER_PAGE_SIZE = 30;

/**
 * Mensagens de uma conversa. As MAIS RECENTES vêm por SWR (polling 15s + SSE
 * chama mutate ao chegar algo). As ANTIGAS são carregadas sob demanda em blocos
 * (loadOlder) e acumuladas no client — economiza busca no banco e mantém a
 * thread leve, sem puxar toda a conversa de uma vez.
 */
export function useWhatsAppMessages(contactId: string | null) {
  const { data, mutate, isLoading } = useSWR<{ messages: WhatsAppThreadMessage[]; hasMore?: boolean }>(
    contactId ? `/api/whatsapp/messages?contactId=${encodeURIComponent(contactId)}&limit=50` : null,
    fetcher,
    { refreshInterval: 15_000, revalidateOnFocus: true },
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

/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
'use client';

import { useCallback, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { listMyChannels, type ChannelDTO } from '@/app/_actions/chat/channels';

export interface Reaction {
  emoji: string;
  userId: string;
  userName: string;
}

export interface ChatMessage {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  channelId: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  replyToId?: string | null;
  replyToAuthor?: string | null;
  replyToBody?: string | null;
  attachmentKey?: string | null;
  attachmentName?: string | null;
  attachmentType?: string | null;
  reactions?: Reaction[];
}

/** Evento efêmero de "digitando…" trafegado pelo mesmo canal SSE. */
export interface TypingEvent {
  type: 'typing';
  channelId: string;
  userId: string;
  userName: string;
}

/** Patch de reações de uma mensagem (não recarrega a mensagem inteira). */
export interface ReactionEvent {
  type: 'reaction';
  channelId: string;
  messageId: string;
  reactions: Reaction[];
}

export type ChatStreamEvent = ChatMessage | TypingEvent | ReactionEvent;

export function isTypingEvent(e: ChatStreamEvent): e is TypingEvent {
  return (e as TypingEvent).type === 'typing';
}

export function isReactionEvent(e: ChatStreamEvent): e is ReactionEvent {
  return (e as ReactionEvent).type === 'reaction';
}

const fetcher = (url: string) => fetch(url, { cache: 'no-store' }).then((r) => r.json());

/**
 * Mensagens de um canal, com polling SWR (rede de segurança) a cada 15s.
 * O SSE (useChatStream) acelera a entrega chamando `mutate` ao chegar algo.
 */
export function useChannelMessages(channelId: string | null) {
  const { data, mutate, isLoading } = useSWR<{ messages: ChatMessage[] }>(
    channelId ? `/api/chat/messages?channelId=${encodeURIComponent(channelId)}` : null,
    fetcher,
    { refreshInterval: 15_000, revalidateOnFocus: true },
  );

  return { messages: data?.messages ?? [], mutate, isLoading };
}

/** Contagem de não-lidas por canal (badges da sidebar/lista). */
export function useUnread() {
  const { data, mutate } = useSWR<{ unread: Record<string, number> }>(
    '/api/chat/read',
    fetcher,
    { refreshInterval: 20_000, revalidateOnFocus: true },
  );
  return { unread: data?.unread ?? {}, refreshUnread: mutate };
}

/**
 * Canais restritos em que o usuário logado é membro (via server action).
 * Polling de 20s: renomear/excluir um canal (dono) não passa pelo SSE, então
 * os demais membros só veem a mudança no próximo foco/poll.
 */
export function useMyChannels() {
  const { data, mutate, isLoading } = useSWR<ChannelDTO[]>(
    'chat-my-channels',
    () => listMyChannels(),
    { refreshInterval: 20_000, revalidateOnFocus: true },
  );
  return { channels: data ?? [], refreshChannels: mutate, isLoading };
}

/** Marca um canal como lido (zera o badge). */
export async function markChannelRead(channelId: string) {
  try {
    await fetch('/api/chat/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId }),
    });
  } catch { /* silencioso */ }
}

/** Sinaliza "digitando…" no canal (efêmero; no-op se o relay estiver off). */
export async function sendTyping(channelId: string) {
  try {
    await fetch('/api/chat/typing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId }),
    });
  } catch { /* silencioso */ }
}

/**
 * Conexão SSE única com o relay (Railway). Chama `onMessage` a cada mensagem
 * recebida. Se o relay não estiver configurado, simplesmente não faz nada — o
 * chat segue funcionando pelo polling. Reconecta com backoff em caso de queda.
 */
export function useChatStream(onMessage: (e: ChatStreamEvent) => void) {
  const handlerRef = useRef(onMessage);
  handlerRef.current = onMessage;

  useEffect(() => {
    let es: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    async function connect() {
      if (closed) return;
      try {
        const res = await fetch('/api/chat/token', { cache: 'no-store' });
        const { url, token } = await res.json();
        if (!url || !token || closed) return; // relay off -> só polling

        es = new EventSource(`${url}/events?token=${encodeURIComponent(token)}`);

        es.addEventListener('message', (ev) => {
          try {
            const evt = JSON.parse((ev as MessageEvent).data) as ChatStreamEvent;
            // Mensagem real tem `id`; evento de digitando tem `type: 'typing'`.
            if (evt && ((evt as ChatMessage).id || (evt as TypingEvent).type)) {
              handlerRef.current(evt);
            }
          } catch { /* ignora payloads malformados */ }
        });

        es.onerror = () => {
          es?.close();
          es = null;
          if (!closed) retry = setTimeout(connect, 3_000);
        };
      } catch {
        if (!closed) retry = setTimeout(connect, 5_000);
      }
    }

    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, []);
}

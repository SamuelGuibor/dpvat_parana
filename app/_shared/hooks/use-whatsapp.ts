'use client';

import useSWR from 'swr';
import {
  listWhatsAppConversations,
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

/** Mensagens de uma conversa. Polling de 15s; SSE chama mutate ao chegar algo. */
export function useWhatsAppMessages(contactId: string | null) {
  const { data, mutate, isLoading } = useSWR<{ messages: WhatsAppThreadMessage[] }>(
    contactId ? `/api/whatsapp/messages?contactId=${encodeURIComponent(contactId)}` : null,
    fetcher,
    { refreshInterval: 15_000, revalidateOnFocus: true },
  );
  return { messages: data?.messages ?? [], mutate, isLoading };
}

/** Total de conversas não lidas (badge da sidebar do workspace). */
export function useWhatsAppUnread() {
  const { conversations } = useWhatsAppConversations();
  return conversations.filter((c) => c.unread && c.status !== 'closed').length;
}

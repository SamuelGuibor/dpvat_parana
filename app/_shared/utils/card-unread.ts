// Selo "cliente mandou mensagem" no card do Kanban (T-AJ2PT, 09/11): tipos e
// leitura da resposta de GET /api/kanban/unread, sem Prisma (o board importa).
//
// "Não lida" é a MESMA regra do inbox e do badge do topo (docs/ai/whatsapp-bot.md):
// mensagem RECEBIDA do cliente depois da última leitura da equipe, ou "marcar
// como não lida" manual; só conversa não encerrada. Abrir a conversa no inbox
// marca como lida e o selo some no próximo poll.

export const CARD_UNREAD_URL = '/api/kanban/unread';
/** Poll do selo: o mesmo ritmo do badge de não lidas do cabeçalho. */
export const CARD_UNREAD_POLL_MS = 30_000;

export interface CardUnreadEntry {
  /** Contato a abrir no inbox (o de mensagem recebida mais recente, se o card tiver mais de um). */
  contactId: string;
  /** ISO da última mensagem recebida sem leitura (null = só "marcar como não lida"). */
  at: string | null;
}

export interface CardUnreadResponse {
  users: Record<string, CardUnreadEntry>;
  processes: Record<string, CardUnreadEntry>;
}

export const EMPTY_CARD_UNREAD: CardUnreadResponse = { users: {}, processes: {} };

/** Linha crua da consulta → mapa por card, ficando com o contato de mensagem mais recente. */
export function groupCardUnread(
  rows: readonly { userId: string | null; processId: string | null; contactId: string; at: Date | string | null }[],
): CardUnreadResponse {
  const out: CardUnreadResponse = { users: {}, processes: {} };
  for (const r of rows) {
    const at = r.at ? new Date(r.at).toISOString() : null;
    const put = (bucket: Record<string, CardUnreadEntry>, id: string) => {
      const cur = bucket[id];
      if (!cur || (at && (!cur.at || at > cur.at))) bucket[id] = { contactId: r.contactId, at };
    };
    if (r.processId) put(out.processes, r.processId);
    else if (r.userId) put(out.users, r.userId);
  }
  return out;
}

/** Resposta fora do formato vira mapa vazio (o selo some; nunca quebra o board). */
export function readCardUnread(data: unknown): CardUnreadResponse {
  if (!data || typeof data !== 'object') return EMPTY_CARD_UNREAD;
  const o = data as Record<string, unknown>;
  const bucket = (v: unknown): Record<string, CardUnreadEntry> => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const res: Record<string, CardUnreadEntry> = {};
    for (const [id, e] of Object.entries(v as Record<string, unknown>)) {
      const entry = e as Partial<CardUnreadEntry> | null;
      if (entry && typeof entry.contactId === 'string') {
        res[id] = { contactId: entry.contactId, at: typeof entry.at === 'string' ? entry.at : null };
      }
    }
    return res;
  };
  return { users: bucket(o.users), processes: bucket(o.processes) };
}

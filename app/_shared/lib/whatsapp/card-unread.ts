import { db } from '@/app/_shared/lib/prisma';
import { groupCardUnread, type CardUnreadResponse } from '@/app/_shared/utils/card-unread';

// Conversas não lidas por card (selo do Kanban, T-AJ2PT). SEM guarda: quem
// chama (GET /api/kanban/unread) já passou por `teamRoute('view_whatsapp')`.
//
// Mesma regra de `countUnreadConversations` (inbox-data.ts), só que devolvendo
// QUAIS: leitura efetiva = GREATEST(lastReadAt legado, leituras da equipe);
// não lida = epoch (manual) ou mensagem recebida (direction 'in', não interna)
// depois dela; encerrada não conta. O MAX do LATERAL anda no índice
// (contactId, createdAt) de whatsapp_messages: nada de `distinct` do Prisma
// nessa tabela (regra do CLAUDE.md). Só contato ligado a card.
export async function loadUnreadByCard(): Promise<CardUnreadResponse> {
  const rows = await db.$queryRaw<{ userId: string | null; processId: string | null; contactId: string; at: Date | null }[]>`
    SELECT ct."userId", ct."processId", ct.id AS "contactId", li.at
    FROM whatsapp_conversations c
    JOIN whatsapp_contacts ct ON ct.id = c."contactId"
    CROSS JOIN LATERAL (
      SELECT GREATEST(c."lastReadAt", MAX(r."lastReadAt")) AS read_at
      FROM whatsapp_conversation_reads r
      WHERE r."conversationId" = c.id
    ) rr
    CROSS JOIN LATERAL (
      SELECT MAX(m."createdAt") AS at
      FROM whatsapp_messages m
      WHERE m."contactId" = c."contactId" AND m.direction = 'in' AND m.internal = false
        AND m."createdAt" > COALESCE(rr.read_at, TIMESTAMP 'epoch')
    ) li
    WHERE c.status <> 'closed'
      AND (ct."userId" IS NOT NULL OR ct."processId" IS NOT NULL)
      AND (rr.read_at = TIMESTAMP 'epoch' OR li.at IS NOT NULL)
  `;
  return groupCardUnread(rows);
}

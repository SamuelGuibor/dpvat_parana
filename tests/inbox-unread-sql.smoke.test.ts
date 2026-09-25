import { describe, expect, it } from "vitest";
import { db } from "@/app/_shared/lib/prisma";

// Conferência SÓ LEITURA da contagem de não lidas da lista do inbox
// (loadConversations em app/_actions/whatsapp/conversations.ts): a query nova
// (LATERAL por conversa, com a leitura efetiva no SQL) tem que devolver
// exatamente o que a antiga devolvia (JOIN de todas as mensagens recebidas +
// GROUP BY) e a leitura efetiva que o JS calculava a partir do include `reads`.
//
//   npm run inbox:sql-smoke
//
// Precisa de banco (o .env local é PRODUÇÃO): roda só com o script acima ou
// com INBOX_SQL_SMOKE=1, numa transação READ ONLY. Fora disso (npm test, CI)
// fica pulado.
//
// A query "nova" abaixo é CÓPIA da de loadConversations: mudou lá, mude aqui.

const ativo = process.env.INBOX_SQL_SMOKE === "1" || process.env.npm_lifecycle_event === "inbox:sql-smoke";

describe.skipIf(!ativo)("não lidas do inbox: query nova = query antiga", () => {
  it("mesma contagem e mesma leitura efetiva nas 1.000 conversas da lista", async () => {
    const { ids, oldCounts, oldReads, newRows } = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const top = await tx.$queryRaw<{ contactId: string }[]>`
        SELECT "contactId" FROM whatsapp_conversations ORDER BY "lastMessageAt" DESC LIMIT 1000
      `;
      const ids = top.map((r) => r.contactId);

      const oldCounts = await tx.$queryRaw<{ contactId: string; cnt: number }[]>`
        SELECT c."contactId" AS "contactId", COUNT(m.id)::int AS cnt
        FROM whatsapp_conversations c
        JOIN whatsapp_messages m
          ON m."contactId" = c."contactId" AND m.direction = 'in' AND m.internal = false
        LEFT JOIN LATERAL (
          SELECT MAX(r."lastReadAt") AS read_at
          FROM whatsapp_conversation_reads r
          WHERE r."conversationId" = c.id
        ) rr ON true
        WHERE c."contactId" = ANY(${ids})
          AND m."createdAt" > COALESCE(GREATEST(c."lastReadAt", rr.read_at), to_timestamp(0))
        GROUP BY c."contactId"
      `;

      const oldReads = await tx.whatsAppConversation.findMany({
        where: { contactId: { in: ids } },
        select: {
          contactId: true,
          lastReadAt: true,
          reads: { orderBy: { lastReadAt: "desc" }, take: 1, select: { lastReadAt: true } },
        },
      });

      const newRows = await tx.$queryRaw<{ contactId: string; readAt: Date | null; cnt: number }[]>`
        SELECT c."contactId", rr.read_at AS "readAt", u.cnt
        FROM whatsapp_conversations c
        CROSS JOIN LATERAL (
          SELECT GREATEST(c."lastReadAt", MAX(r."lastReadAt")) AS read_at
          FROM whatsapp_conversation_reads r
          WHERE r."conversationId" = c.id
        ) rr
        CROSS JOIN LATERAL (
          SELECT COUNT(*)::int AS cnt
          FROM whatsapp_messages m
          WHERE m."contactId" = c."contactId" AND m.direction = 'in' AND m.internal = false
            AND m."createdAt" > COALESCE(rr.read_at, to_timestamp(0))
        ) u
        WHERE c."contactId" = ANY(${ids})
      `;
      return { ids, oldCounts, oldReads, newRows };
    }, { timeout: 60_000, maxWait: 15_000 });

    // Uma linha por conversa (contactId é único em whatsapp_conversations).
    expect(newRows.length).toBe(ids.length);

    const oldCnt = new Map(oldCounts.map((r) => [r.contactId, Number(r.cnt)]));
    const cntDiff = newRows.filter((r) => Number(r.cnt) !== (oldCnt.get(r.contactId) ?? 0));
    expect(cntDiff).toEqual([]);

    // Leitura efetiva do jeito que o JS antigo calculava.
    const oldReadAt = new Map(oldReads.map((c) => {
      const any = c.reads[0]?.lastReadAt ?? null;
      const eff = any && c.lastReadAt ? (any > c.lastReadAt ? any : c.lastReadAt) : any ?? c.lastReadAt;
      return [c.contactId, eff?.getTime() ?? null];
    }));
    const readDiff = newRows.filter((r) => (r.readAt?.getTime() ?? null) !== oldReadAt.get(r.contactId));
    expect(readDiff).toEqual([]);
  }, 120_000);
});

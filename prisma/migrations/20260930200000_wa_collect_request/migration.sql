-- Pedido em aberto da IA (30/09/2026): o que a IA deve recolher até completar
-- (texto do "Devolver ao bot", lista detectada na mensagem do atendente ou
-- fluxo com cara de lista que a própria IA mandou), a cobrança automática do
-- silêncio e o último "Devolver ao bot". Tudo aditivo; sem índice novo (o cron
-- filtra por status, que já tem índice). Gerado por `prisma migrate diff`; a
-- linha `DROP TABLE "discord"` (tabela órfã conhecida) foi apagada de propósito.

-- AlterTable
ALTER TABLE "whatsapp_conversations" ADD COLUMN     "collectNudgeAt" TIMESTAMP(3),
ADD COLUMN     "collectNudgeCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "collectRequest" TEXT,
ADD COLUMN     "collectRequestAt" TIMESTAMP(3),
ADD COLUMN     "collectRequestById" TEXT,
ADD COLUMN     "collectRequestEndedAt" TIMESTAMP(3),
ADD COLUMN     "collectRequestSource" TEXT,
ADD COLUMN     "returnedToBotAt" TIMESTAMP(3);

-- Backfill: último "Devolver ao bot" de cada contato, tirado dos logs
-- wa_return_bot (conferido em 30/09/2026 por SELECT: 2.396 conversas, 102 em
-- 'bot', 278 devolvidas nos últimos 7 dias). O log é purgável (180 dias):
-- devolução mais antiga que isso fica sem data, o que só desliga o fato
-- "conversa devolvida" (vale por 7 dias) nessas conversas.
UPDATE "whatsapp_conversations" c
SET "returnedToBotAt" = r.last_return
FROM (
  SELECT l.metadata->>'contactId' AS contact_id, max(l."createdAt") AS last_return
  FROM "logs" l
  WHERE l.action = 'wa_return_bot' AND l.metadata->>'contactId' IS NOT NULL
  GROUP BY 1
) r
WHERE c."contactId" = r.contact_id
  AND c."returnedToBotAt" IS NULL;

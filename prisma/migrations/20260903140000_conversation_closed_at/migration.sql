-- Data real do encerramento da conversa (antes as métricas usavam updatedAt
-- como proxy). Backfill: para as já encerradas, o melhor que temos é updatedAt.
ALTER TABLE "whatsapp_conversations" ADD COLUMN "closedAt" TIMESTAMP(3);
UPDATE "whatsapp_conversations" SET "closedAt" = "updatedAt" WHERE "status" = 'closed';

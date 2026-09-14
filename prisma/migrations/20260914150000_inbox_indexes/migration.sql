-- Lista do inbox ordena 1.000 conversas por lastMessageAt a cada poll; só
-- existia índice composto (numberId, lastMessageAt).
CREATE INDEX IF NOT EXISTS "whatsapp_conversations_lastMessageAt_idx" ON "whatsapp_conversations"("lastMessageAt" DESC);

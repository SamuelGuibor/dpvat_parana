-- Hash do inbox (getWhatsAppInboxVersion) pede max("createdAt") de
-- whatsapp_messages a cada poll de 15 s por aba: era seq scan da tabela toda.
CREATE INDEX IF NOT EXISTS "whatsapp_messages_createdAt_idx" ON "whatsapp_messages"("createdAt");

-- markConversationRead apaga o sino por contato (contactId + read = false)
-- a cada conversa aberta: também era seq scan.
CREATE INDEX IF NOT EXISTS "Notification_contactId_read_idx" ON "Notification"("contactId", "read");

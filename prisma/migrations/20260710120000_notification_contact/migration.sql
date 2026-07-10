-- Notificações de WhatsApp: guarda o contato para o clique abrir a conversa.
ALTER TABLE "Notification" ADD COLUMN "contactId" TEXT;

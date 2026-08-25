-- Reação da EQUIPE aplicada a uma mensagem do WhatsApp (emoji único, estilo
-- app). Enviada à Meta via type:"reaction"; null = sem reação.
ALTER TABLE "whatsapp_messages" ADD COLUMN "reaction" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN "reactionAuthorId" TEXT;

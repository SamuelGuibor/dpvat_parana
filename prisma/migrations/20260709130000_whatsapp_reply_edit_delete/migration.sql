-- Reply (quote) + edição/exclusão locais nas mensagens de WhatsApp
ALTER TABLE "whatsapp_messages" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "whatsapp_messages" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "whatsapp_messages" ADD COLUMN "replyToId" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN "replyToBody" TEXT;
ALTER TABLE "whatsapp_messages" ADD COLUMN "replyToDirection" TEXT;

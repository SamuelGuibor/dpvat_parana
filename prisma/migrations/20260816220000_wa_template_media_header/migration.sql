-- Cabeçalho de mídia nos templates do WhatsApp (IMAGE/VIDEO/DOCUMENT)
ALTER TABLE "whatsapp_templates" ADD COLUMN "headerFormat" TEXT;
ALTER TABLE "whatsapp_templates" ADD COLUMN "headerMediaKey" TEXT;
ALTER TABLE "whatsapp_templates" ADD COLUMN "headerMediaType" TEXT;

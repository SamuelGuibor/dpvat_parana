-- Cérebro da IA por conversa: memória, estado, contador de falhas e nudges de silêncio
ALTER TABLE "whatsapp_conversations" ADD COLUMN "botMemory" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN "botState" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN "botFailCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "whatsapp_conversations" ADD COLUMN "botNudge30At" TIMESTAMP(3);
ALTER TABLE "whatsapp_conversations" ADD COLUMN "botNudge24At" TIMESTAMP(3);

-- Respostas em áudio (ElevenLabs) para cliente que não lê/escreve.
-- AlterTable
ALTER TABLE "whatsapp_contacts" ADD COLUMN     "voiceReplies" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "voiceRepliesAt" TIMESTAMP(3),
ADD COLUMN     "voiceRepliesBy" TEXT;

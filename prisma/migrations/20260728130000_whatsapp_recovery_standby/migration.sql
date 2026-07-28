-- AlterTable
ALTER TABLE "whatsapp_conversations" ADD COLUMN     "recoveryAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "recoveryNextAt" TIMESTAMP(3),
ADD COLUMN     "recoveryOutcome" TEXT;


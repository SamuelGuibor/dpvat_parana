-- Recuperação manual pelo atendente + nota interna fixada (21/10/2026)
ALTER TABLE "whatsapp_conversations" ADD COLUMN IF NOT EXISTS "recoveryManualById" TEXT,
ADD COLUMN IF NOT EXISTS "recoveryManualMax" INTEGER,
ADD COLUMN IF NOT EXISTS "pinnedNoteId" TEXT,
ADD COLUMN IF NOT EXISTS "pinnedNoteAt" TIMESTAMP(3);

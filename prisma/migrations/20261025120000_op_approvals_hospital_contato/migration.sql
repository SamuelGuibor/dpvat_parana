-- Etapa 5 da IA de operação (aditiva): contato do hospital nos GHOST e
-- aprovações L4 (e-mail/WhatsApp preparados pela IA, enviados só com
-- "aprovo <código>" digitado pelo operador). Gerado por migrate diff; a linha
-- DROP TABLE "discord" (drift conhecido) foi apagada.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hospital_email" TEXT,
ADD COLUMN     "hospital_modo" TEXT,
ADD COLUMN     "hospital_obs" TEXT,
ADD COLUMN     "hospital_telefone" TEXT;

-- CreateTable
CREATE TABLE "op_approvals" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "hash" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "cardId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedRequestId" TEXT,
    "executedAt" TIMESTAMP(3),
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "op_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "op_approvals_operatorId_createdAt_idx" ON "op_approvals"("operatorId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "op_approvals_status_expiresAt_idx" ON "op_approvals"("status", "expiresAt");

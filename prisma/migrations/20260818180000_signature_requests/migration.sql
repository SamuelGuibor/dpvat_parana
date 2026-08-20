-- Assinatura eletrônica própria: ciclo de contrato/procuração por contato.
-- Aditiva: cria só a tabela nova (a órfã "discord" que aparece no migrate diff
-- NÃO é derrubada aqui — é outro assunto).

-- CreateTable
CREATE TABLE "signature_requests" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aguardando',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "origin" TEXT NOT NULL DEFAULT 'bot',
    "createdById" TEXT,
    "createdByName" TEXT,
    "deliveredBy" TEXT,
    "extracted" JSONB,
    "missingFields" JSONB,
    "pdfKey" TEXT,
    "signedPdfKey" TEXT,
    "documentHash" TEXT,
    "signedHash" TEXT,
    "otpHash" TEXT,
    "otpExpiresAt" TIMESTAMP(3),
    "otpAttempts" INTEGER NOT NULL DEFAULT 0,
    "otpSentAt" TIMESTAMP(3),
    "signatureKey" TEXT,
    "signatureMode" TEXT,
    "audit" JSONB,
    "confirmRounds" INTEGER NOT NULL DEFAULT 0,
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "nextReminderAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "validatedById" TEXT,
    "refusedReason" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "signature_requests_token_key" ON "signature_requests"("token");

-- CreateIndex
CREATE INDEX "signature_requests_status_nextReminderAt_idx" ON "signature_requests"("status", "nextReminderAt");

-- CreateIndex
CREATE INDEX "signature_requests_contactId_createdAt_idx" ON "signature_requests"("contactId", "createdAt");

-- AddForeignKey
ALTER TABLE "signature_requests" ADD CONSTRAINT "signature_requests_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "whatsapp_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

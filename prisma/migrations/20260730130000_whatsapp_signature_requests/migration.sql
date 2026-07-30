-- CreateTable
CREATE TABLE "whatsapp_signature_requests" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'aguardando',
    "docToken" TEXT,
    "signerToken" TEXT,
    "signUrl" TEXT,
    "extracted" JSONB,
    "missingFields" JSONB,
    "pdfKey" TEXT,
    "signedPdfKey" TEXT,
    "remindersSent" INTEGER NOT NULL DEFAULT 0,
    "nextReminderAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "validatedAt" TIMESTAMP(3),
    "validatedById" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_signature_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_signature_requests_docToken_key" ON "whatsapp_signature_requests"("docToken");

-- CreateIndex
CREATE INDEX "whatsapp_signature_requests_status_nextReminderAt_idx" ON "whatsapp_signature_requests"("status", "nextReminderAt");

-- CreateIndex
CREATE INDEX "whatsapp_signature_requests_contactId_createdAt_idx" ON "whatsapp_signature_requests"("contactId", "createdAt");

-- AddForeignKey
ALTER TABLE "whatsapp_signature_requests" ADD CONSTRAINT "whatsapp_signature_requests_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "whatsapp_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


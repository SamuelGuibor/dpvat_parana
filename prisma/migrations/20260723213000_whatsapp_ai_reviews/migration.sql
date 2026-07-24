-- CreateTable
CREATE TABLE "whatsapp_reviews" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "conversationId" TEXT,
    "s3Key" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT NOT NULL,
    "closeCategory" TEXT,
    "qualified" BOOLEAN,
    "closedReason" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "botOnly" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "verdict" TEXT,
    "comment" TEXT,
    "errorTags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "correctReply" TEXT,
    "reviewerId" TEXT,
    "reviewerName" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "aiSuggestedVerdict" TEXT,
    "aiSuggestedReason" TEXT,
    "distilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_reviews_s3Key_key" ON "whatsapp_reviews"("s3Key");

-- CreateIndex
CREATE INDEX "whatsapp_reviews_status_createdAt_idx" ON "whatsapp_reviews"("status", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_reviews_contactId_idx" ON "whatsapp_reviews"("contactId");

-- CreateIndex
CREATE INDEX "whatsapp_reviews_distilledAt_idx" ON "whatsapp_reviews"("distilledAt");


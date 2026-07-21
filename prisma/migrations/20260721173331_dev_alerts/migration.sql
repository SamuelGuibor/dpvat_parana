-- CreateTable
CREATE TABLE "dev_alerts" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "message" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dev_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dev_alerts_expiresAt_idx" ON "dev_alerts"("expiresAt");

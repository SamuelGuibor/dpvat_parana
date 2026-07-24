-- CreateTable
CREATE TABLE "whatsapp_instructions" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "intro" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'rascunho',
    "changeNote" TEXT,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_instructions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_instructions_version_key" ON "whatsapp_instructions"("version");

-- CreateIndex
CREATE INDEX "whatsapp_instructions_status_version_idx" ON "whatsapp_instructions"("status", "version");


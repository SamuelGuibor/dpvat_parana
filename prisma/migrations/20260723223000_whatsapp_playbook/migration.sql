-- AlterTable
ALTER TABLE "whatsapp_reviews" ADD COLUMN     "lesson" TEXT,
ADD COLUMN     "lessonEdited" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lessonSection" TEXT,
ADD COLUMN     "lessonStates" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "whatsapp_playbooks" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "sections" JSONB NOT NULL,
    "rulesCount" INTEGER NOT NULL DEFAULT 0,
    "changeNote" TEXT,
    "status" TEXT NOT NULL DEFAULT 'rascunho',
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "publishedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_playbooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_playbooks_version_key" ON "whatsapp_playbooks"("version");

-- CreateIndex
CREATE INDEX "whatsapp_playbooks_status_version_idx" ON "whatsapp_playbooks"("status", "version");


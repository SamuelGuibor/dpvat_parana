-- Formulários do WhatsApp (Meta Flows), T-7ZQH6.

-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN     "interactive" JSONB;

-- CreateTable
CREATE TABLE "whatsapp_form_versions" (
    "id" TEXT NOT NULL,
    "wabaId" TEXT NOT NULL,
    "metaFlowId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "categories" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "flowJson" JSONB,
    "bodyText" TEXT,
    "cta" TEXT,
    "headerText" TEXT,
    "footerText" TEXT,
    "createdById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_form_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_form_versions_metaFlowId_key" ON "whatsapp_form_versions"("metaFlowId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "whatsapp_form_versions_wabaId_familyId_idx" ON "whatsapp_form_versions"("wabaId", "familyId");

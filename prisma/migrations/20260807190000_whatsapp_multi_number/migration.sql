-- Multi-número WhatsApp (07/08/2026): tabela whatsapp_numbers (credenciais por
-- número, token criptografado) + numberId nas tabelas quentes. Aditivo: colunas
-- novas são NULL e o código antigo continua funcionando; o unique global de
-- phone vira composto (numberId, phone) porque o mesmo cliente pode falar com
-- dois números da empresa.

-- DropIndex
DROP INDEX "whatsapp_contacts_phone_key";

-- DropIndex
DROP INDEX "whatsapp_templates_name_key";

-- AlterTable
ALTER TABLE "whatsapp_contacts" ADD COLUMN     "numberId" TEXT;

-- AlterTable
ALTER TABLE "whatsapp_conversations" ADD COLUMN     "numberId" TEXT;

-- AlterTable
ALTER TABLE "whatsapp_messages" ADD COLUMN     "numberId" TEXT;

-- AlterTable
ALTER TABLE "whatsapp_rule_events" ADD COLUMN     "numberId" TEXT;

-- AlterTable
ALTER TABLE "whatsapp_templates" ADD COLUMN     "numberId" TEXT;

-- CreateTable
CREATE TABLE "whatsapp_numbers" (
    "id" TEXT NOT NULL,
    "phoneNumberId" TEXT NOT NULL,
    "wabaId" TEXT,
    "displayPhone" TEXT,
    "label" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "appSecretEnc" TEXT,
    "apiVersion" TEXT NOT NULL DEFAULT 'v21.0',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_numbers_phoneNumberId_key" ON "whatsapp_numbers"("phoneNumberId");

-- CreateIndex
CREATE INDEX "whatsapp_contacts_phone_idx" ON "whatsapp_contacts"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_contacts_numberId_phone_key" ON "whatsapp_contacts"("numberId", "phone");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_numberId_lastMessageAt_idx" ON "whatsapp_conversations"("numberId", "lastMessageAt");

-- CreateIndex
CREATE INDEX "whatsapp_messages_numberId_createdAt_idx" ON "whatsapp_messages"("numberId", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_rule_events_numberId_createdAt_idx" ON "whatsapp_rule_events"("numberId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_numberId_name_key" ON "whatsapp_templates"("numberId", "name");

-- Rascunho da ficha do cliente por conversa (contato sem User vinculado)
ALTER TABLE "whatsapp_contacts" ADD COLUMN "clientDraft" JSONB;

-- Fluxos de mensagens pré-setadas (sequência de textos com delay)
CREATE TABLE "whatsapp_flows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_flows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_flows_name_key" ON "whatsapp_flows"("name");

-- Qualificação da conversa (decidida ao encerrar)
ALTER TABLE "whatsapp_conversations" ADD COLUMN "qualified" BOOLEAN;

-- Tags livres pra organizar conversas
CREATE TABLE "whatsapp_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#10b981',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_tags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "whatsapp_tags_name_key" ON "whatsapp_tags"("name");

CREATE TABLE "whatsapp_conversation_tags" (
    "conversationId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "whatsapp_conversation_tags_pkey" PRIMARY KEY ("conversationId", "tagId")
);

ALTER TABLE "whatsapp_conversation_tags" ADD CONSTRAINT "whatsapp_conversation_tags_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "whatsapp_conversation_tags" ADD CONSTRAINT "whatsapp_conversation_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "whatsapp_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Texto de referência do template (só exibição, não vai pra Meta)
ALTER TABLE "whatsapp_templates" ADD COLUMN "bodyPreview" TEXT;

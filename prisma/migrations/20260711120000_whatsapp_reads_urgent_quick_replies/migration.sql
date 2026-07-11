-- Urgência (IA) + SLA da fila na conversa
ALTER TABLE "whatsapp_conversations" ADD COLUMN "urgent" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "whatsapp_conversations" ADD COLUMN "queuedAt" TIMESTAMP(3);
ALTER TABLE "whatsapp_conversations" ADD COLUMN "queueAlertAt" TIMESTAMP(3);

-- Leitura por atendente (o lastReadAt global vira fallback legado)
CREATE TABLE "whatsapp_conversation_reads" (
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_conversation_reads_pkey" PRIMARY KEY ("conversationId","userId")
);

ALTER TABLE "whatsapp_conversation_reads"
    ADD CONSTRAINT "whatsapp_conversation_reads_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "whatsapp_conversations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Respostas rápidas (snippets) do atendimento
CREATE TABLE "whatsapp_quick_replies" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_quick_replies_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_quick_replies_title_key" ON "whatsapp_quick_replies"("title");

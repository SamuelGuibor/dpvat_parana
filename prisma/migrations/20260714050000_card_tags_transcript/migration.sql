-- Tags livres dos cards do kanban (many-to-many com User e Process)
CREATE TABLE "card_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_tags_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "card_tags_name_key" ON "card_tags"("name");

-- Join implícito do Prisma: _<relationName>, colunas A/B em ordem alfabética
-- de model (CardTag < Process < User → A = CardTag nas duas tabelas).
CREATE TABLE "_UserCardTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "_UserCardTags_AB_unique" ON "_UserCardTags"("A", "B");
CREATE INDEX "_UserCardTags_B_index" ON "_UserCardTags"("B");

ALTER TABLE "_UserCardTags" ADD CONSTRAINT "_UserCardTags_A_fkey"
    FOREIGN KEY ("A") REFERENCES "card_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_UserCardTags" ADD CONSTRAINT "_UserCardTags_B_fkey"
    FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "_ProcessCardTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

CREATE UNIQUE INDEX "_ProcessCardTags_AB_unique" ON "_ProcessCardTags"("A", "B");
CREATE INDEX "_ProcessCardTags_B_index" ON "_ProcessCardTags"("B");

ALTER TABLE "_ProcessCardTags" ADD CONSTRAINT "_ProcessCardTags_A_fkey"
    FOREIGN KEY ("A") REFERENCES "card_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_ProcessCardTags" ADD CONSTRAINT "_ProcessCardTags_B_fkey"
    FOREIGN KEY ("B") REFERENCES "Process"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Transcrição de áudio sob demanda no atendimento humano (persistida)
ALTER TABLE "whatsapp_messages" ADD COLUMN "transcript" TEXT;

-- Tarefa de setor com estado compartilhado: todas as cópias (uma por pessoa)
-- carregam o mesmo groupId; mudar o status numa cópia aplica em todas.
ALTER TABLE "mentions" ADD COLUMN "groupId" TEXT;
CREATE INDEX "mentions_groupId_idx" ON "mentions"("groupId");

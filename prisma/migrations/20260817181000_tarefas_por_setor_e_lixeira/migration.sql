-- Tarefas por setor: snapshot do setor responsável na menção (roteamento em
-- app/_shared/lib/sector-tasks.ts).
ALTER TABLE "mentions" ADD COLUMN "sectorId" TEXT;
ALTER TABLE "mentions" ADD COLUMN "sectorName" TEXT;

-- Lixeira da aba Arquivos: excluir marca deletedAt (30 dias restaurável);
-- a purga definitiva é do cron /api/documents/trash/purge.
ALTER TABLE "Document" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Document" ADD COLUMN "deletedBy" TEXT;

CREATE INDEX "Document_deletedAt_idx" ON "Document"("deletedAt");

-- Ordem manual dos cards dentro da coluna do kanban (menor = mais acima).
-- null = sem ordem definida (cai no fim, na ordem natural de criação).
ALTER TABLE "User" ADD COLUMN "boardOrder" INTEGER;
ALTER TABLE "Process" ADD COLUMN "boardOrder" INTEGER;

-- Ordem manual dos arquivos na aba Arquivos do card.
ALTER TABLE "Document" ADD COLUMN "sortOrder" INTEGER;

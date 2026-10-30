-- Cérebro APP: setor da sugestão no quadro (aditivo, nullable).
ALTER TABLE "dev_tickets" ADD COLUMN IF NOT EXISTS "sectorId" TEXT;

CREATE INDEX IF NOT EXISTS "dev_tickets_sectorId_idx" ON "dev_tickets"("sectorId");

-- Adiciona campos senha_inss e cardNumber nas tabelas User e Process
ALTER TABLE "User" ADD COLUMN "senha_inss" TEXT;
ALTER TABLE "User" ADD COLUMN "cardNumber" INTEGER;

ALTER TABLE "Process" ADD COLUMN "senha_inss" TEXT;
ALTER TABLE "Process" ADD COLUMN "cardNumber" INTEGER;

-- Sequência compartilhada para numeração de cards (começa em 4000)
CREATE SEQUENCE IF NOT EXISTS card_number_seq START WITH 4000 INCREMENT BY 1;

-- Backfill: atribui números sequenciais a partir de 4000 para cards existentes,
-- ordenados por createdAt (User e Process juntos).
DO $$
DECLARE
  rec RECORD;
  n INT;
BEGIN
  FOR rec IN (
    SELECT id, 'user'::text AS kind, "createdAt" FROM "User"
    UNION ALL
    SELECT id, 'process'::text AS kind, "createdAt" FROM "Process"
    ORDER BY "createdAt" ASC
  ) LOOP
    n := nextval('card_number_seq');
    IF rec.kind = 'user' THEN
      UPDATE "User" SET "cardNumber" = n WHERE id = rec.id;
    ELSE
      UPDATE "Process" SET "cardNumber" = n WHERE id = rec.id;
    END IF;
  END LOOP;
END $$;

-- Índices únicos
CREATE UNIQUE INDEX "User_cardNumber_key" ON "User"("cardNumber");
CREATE UNIQUE INDEX "Process_cardNumber_key" ON "Process"("cardNumber");

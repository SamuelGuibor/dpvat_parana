-- Rearme dos avisos de prazo (27/08/2026).
--
-- O disparo único era por (automação, card): uma vez avisado, aquele card
-- nunca mais recebia o aviso daquela automação. Só que a data de vencimento
-- MUDA — o benefício é prorrogado, a perícia é remarcada — e o cliente ficava
-- sem o próximo aviso para sempre.
--
-- `cycleKey` guarda o CICLO a que o disparo se refere (a data de vencimento
-- considerada, ou a entrada na coluna). Data nova = ciclo novo = avisa de novo.
-- Disparos antigos ficam com '' e continuam valendo para o ciclo em que saíram.

ALTER TABLE "automation_fires" ADD COLUMN IF NOT EXISTS "cycleKey" TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS "automation_fires_automationId_cardId_key";

CREATE UNIQUE INDEX IF NOT EXISTS "automation_fires_automationId_cardId_cycleKey_key"
  ON "automation_fires" ("automationId", "cardId", "cycleKey");

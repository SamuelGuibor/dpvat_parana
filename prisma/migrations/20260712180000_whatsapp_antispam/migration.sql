-- Anti-spam WhatsApp: opt-in documentado, alerta de falha de entrega e
-- marcação de mensagens proativas do sistema.

ALTER TABLE "whatsapp_contacts" ADD COLUMN "optedInAt" TIMESTAMP(3);
ALTER TABLE "whatsapp_contacts" ADD COLUMN "optInSource" TEXT;

ALTER TABLE "whatsapp_conversations" ADD COLUMN "deliveryAlertAt" TIMESTAMP(3);

ALTER TABLE "whatsapp_messages" ADD COLUMN "systemSource" TEXT;

-- Backfill: contato que já mandou mensagem alguma vez conta como opt-in
-- (fonte "inbound"), datado da primeira mensagem recebida dele.
UPDATE "whatsapp_contacts" c
SET "optedInAt" = m.first_in, "optInSource" = 'inbound'
FROM (
  SELECT "contactId", MIN("createdAt") AS first_in
  FROM "whatsapp_messages"
  WHERE direction = 'in'
  GROUP BY "contactId"
) m
WHERE m."contactId" = c.id AND c."optedInAt" IS NULL;

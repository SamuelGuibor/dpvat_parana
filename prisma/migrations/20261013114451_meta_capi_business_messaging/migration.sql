-- Eventos de mensagens comerciais aceitos pela Meta (LeadSubmitted / Purchase)
ALTER TABLE "whatsapp_contacts" ADD COLUMN IF NOT EXISTS "metaLeadSubmittedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "metaPurchaseAt" TIMESTAMP(3);

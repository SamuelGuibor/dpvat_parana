-- Ficha por IA: origem dos campos (para marcar na ficha) e dica de hospital
-- (a IA coleta o que o cliente falou, mas nunca preenche o select).
ALTER TABLE "whatsapp_contacts" ADD COLUMN IF NOT EXISTS "aiFilledFields" JSONB;
ALTER TABLE "whatsapp_contacts" ADD COLUMN IF NOT EXISTS "hospitalHint" TEXT;

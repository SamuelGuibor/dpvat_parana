-- Campos de contato adicionais do card (cliente e processo):
-- telefone_secundario: segundo telefone/WhatsApp de contato.
-- rede_social: perfil ou @ em rede social (Instagram, Facebook, etc.).
ALTER TABLE "User" ADD COLUMN "telefone_secundario" TEXT;
ALTER TABLE "User" ADD COLUMN "rede_social" TEXT;

ALTER TABLE "Process" ADD COLUMN "telefone_secundario" TEXT;
ALTER TABLE "Process" ADD COLUMN "rede_social" TEXT;

-- Descrição do fluxo (a IA usa para decidir qual disparar) e categoria de
-- encerramento do atendimento (qualificado, perguntas, novo_acidente, etc.).
ALTER TABLE "whatsapp_flows" ADD COLUMN "description" TEXT;
ALTER TABLE "whatsapp_conversations" ADD COLUMN "closeCategory" TEXT;

-- Modelos de contrato do bot (KIT de assinatura) entram no gerenciador:
-- a coluna kind separa procuracao (templates/) de assinatura (templates-assinatura/).
ALTER TABLE "doc_templates" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'procuracao';

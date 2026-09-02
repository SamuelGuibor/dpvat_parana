-- Modelos de contrato (assinatura) passam a ser 100% gerenciados pelo banco
-- (conteúdo em S3), sem cair de volta pro arquivo do repositório — precisa
-- de uma ordem explícita pra manter a sequência do KIT assinável.
ALTER TABLE "doc_templates" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

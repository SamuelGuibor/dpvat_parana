-- Pastas por categoria na aba Arquivos (estilo Google Drive). A pasta do
-- arquivo passa a ser um dado do sistema, não só o nome do PDF.
ALTER TABLE "Document" ADD COLUMN "category" TEXT;

CREATE INDEX "Document_category_idx" ON "Document"("category");

-- Backfill dos anexos que já existem: mesma ordem de precedência do
-- inferCategory() em app/_shared/lib/document-categories.ts. Os padrões
-- param antes do acento de propósito ('%procura%' pega PROCURAÇÃO e
-- PROCURACAO); o '_' do ILIKE vale por 1 caractere, então '%m_dico%' casa
-- MÉDICO e MEDICO. O que não casar fica null e a listagem mostra em OUTROS.
UPDATE "Document" SET "category" = CASE
  WHEN "name" ILIKE '%roteiro%' THEN 'ROTEIRO'
  WHEN "name" ILIKE '%procura%' THEN 'PROCURACAO'
  WHEN "name" ILIKE '%hipossufici%' OR "name" ILIKE '%hipo sufici%' THEN 'HIPOSSUFICIENCIA'
  WHEN "name" ILIKE '%inss%' OR "name" ILIKE '%cnis%'
    OR "name" ILIKE '%carta de concess%' OR "name" ILIKE '%extrato previdenci%' THEN 'DOCS_INSS'
  WHEN "name" ILIKE '%exame%' OR "name" ILIKE '%laudo%' OR "name" ILIKE '%prontu%'
    OR "name" ILIKE '%atestado%' OR "name" ILIKE '%m_dico%' OR "name" ILIKE '%m_dica%'
    OR "name" ILIKE '%raio x%' OR "name" ILIKE '%raiox%' OR "name" ILIKE '%resson%'
    OR "name" ILIKE '%tomografia%' OR "name" ILIKE '%ultrassom%' THEN 'EXAME_MEDICO'
  WHEN "name" ILIKE '%cnh%' OR "name" ILIKE '%identidade%' OR "name" ILIKE '%identifica%'
    OR "name" ILIKE '%documento pessoal%' OR "name" ILIKE '%doc pessoal%'
    OR "name" ILIKE '%doc. pessoal%' OR "name" ILIKE '%rg %' OR "name" ILIKE '%rg.%'
    OR "name" ILIKE '%rg-%'
    OR "name" ILIKE 'rg%' OR "name" ILIKE '%cpf%' THEN 'IDENTIFICACAO'
  WHEN "name" ILIKE '%processo%' OR "name" ILIKE '%peti__o%' OR "name" ILIKE '%senten%'
    OR "name" ILIKE '%despacho%' OR "name" ILIKE '%contrato%' THEN 'PROCESSO'
  ELSE NULL
END
WHERE "category" IS NULL;

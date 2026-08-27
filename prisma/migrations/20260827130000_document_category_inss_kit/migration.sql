-- Reclassificação das pastas dos anexos (27/08/2026), acompanhando as novas
-- regras de app/_shared/lib/document-categories.ts:
--
--   1. Laudo/perícia do INSS é documento PREVIDENCIÁRIO — vai pra DOCS INSS,
--      não pra EXAME MÉDICO (que é o exame do hospital).
--   2. O KIT (previdenciário / CCS) É a procuração + contrato — vai pra
--      PROCURAÇÃO, e não pra OUTROS como caía antes.
--
-- Só mexe em quem está na pasta ERRADA hoje; quem a equipe já moveu na mão
-- para outra pasta fica como está.

UPDATE "Document" SET "category" = 'DOCS_INSS'
WHERE "category" = 'EXAME_MEDICO'
  AND (
       "name" ~* '(^|[^a-z])inss([^a-z]|$)'
    OR "name" ~* '(^|[^a-z])cnis([^a-z]|$)'
    OR "name" ~* 'per(i|í)ci'
    OR "name" ~* '(^|[^a-z])sabi([^a-z]|$)'
    OR "name" ~* 'comunica(d|ç|c)(o|ã|a)?o? de decis(ã|a)o'
    OR "name" ~* 'carta de concess'
    OR "name" ~* 'extrato previdenci'
    OR "name" ~* 'aux(i|í)lio ?(doen|acidente|por incapacidade)'
    OR "name" ~* 'aposentadoria'
    OR "name" ~* 'benef(i|í)cio'
    OR "name" ~* 'afastamento e sal(a|á)rios'
  );

UPDATE "Document" SET "category" = 'PROCURACAO'
WHERE ("category" = 'OUTROS' OR "category" IS NULL)
  AND "name" ~* '(^|[^a-z])kit([^a-z]|$)';

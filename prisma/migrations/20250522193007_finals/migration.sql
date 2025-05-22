/*
  Warnings:

  - The values [ENVIO,SOLICITACAO,COLETA,ANALISE,PERICIA] on the enum `Status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Status_new" AS ENUM ('INICIADO', 'AGUARDANDO_ASSINATURA', 'SOLICITAR_DOCUMENTOS', 'COLETA_DOCUMENTOS', 'ANALISE_DOCUMENTOS', 'PERICIAL', 'AGUARDANDO_PERICIAL', 'PAGAMENTO_HONORARIO', 'PROCESSO_ENCERRADO');
ALTER TABLE "User" ALTER COLUMN "status" TYPE "Status_new" USING ("status"::text::"Status_new");
ALTER TYPE "Status" RENAME TO "Status_old";
ALTER TYPE "Status_new" RENAME TO "Status";
DROP TYPE "Status_old";
COMMIT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cpf_res" TEXT,
ADD COLUMN     "estado_civil_res" TEXT,
ADD COLUMN     "nome_res" TEXT,
ADD COLUMN     "profissao_res" TEXT,
ADD COLUMN     "rg_res" TEXT;

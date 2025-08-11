/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `Process` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `email` to the `Process` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Process" ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "cidade" TEXT,
ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "cpf_res" TEXT,
ADD COLUMN     "data_nasc" TIMESTAMP(3),
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "emailVerified" TIMESTAMP(3),
ADD COLUMN     "estado" TEXT,
ADD COLUMN     "estado_civil" TEXT,
ADD COLUMN     "estado_civil_res" TEXT,
ADD COLUMN     "image" TEXT,
ADD COLUMN     "nacionalidade" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "nome_mae" TEXT,
ADD COLUMN     "nome_res" TEXT,
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "password" TEXT,
ADD COLUMN     "profissao" TEXT,
ADD COLUMN     "profissao_res" TEXT,
ADD COLUMN     "rg" TEXT,
ADD COLUMN     "rg_res" TEXT,
ADD COLUMN     "rua" TEXT,
ADD COLUMN     "telefone" TEXT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'Aplicar Filtro DPVAT';

-- CreateIndex
CREATE UNIQUE INDEX "Process_email_key" ON "Process"("email");

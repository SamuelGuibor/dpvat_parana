-- CreateEnum
CREATE TYPE "Status" AS ENUM ('ENVIO', 'SOLICITACAO', 'COLETA', 'ANALISE', 'PERICIA');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cidade" TEXT,
ADD COLUMN     "estado" TEXT,
ADD COLUMN     "estado_civil" TEXT,
ADD COLUMN     "nacionalidade" TEXT,
ADD COLUMN     "nome_mae" TEXT,
ADD COLUMN     "profissao" TEXT,
ADD COLUMN     "rg" TEXT,
ADD COLUMN     "status" "Status",
ADD COLUMN     "telefone" TEXT;

-- CreateTable
CREATE TABLE "Acidente" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data_acidente" TIMESTAMP(3),
    "atendimento_via" TEXT,
    "hospital" TEXT,
    "outro_hospital" TEXT,
    "lesoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Acidente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Acidente_userId_key" ON "Acidente"("userId");

-- AddForeignKey
ALTER TABLE "Acidente" ADD CONSTRAINT "Acidente_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

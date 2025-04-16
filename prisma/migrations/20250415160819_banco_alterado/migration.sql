/*
  Warnings:

  - You are about to drop the `Acidente` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Acidente" DROP CONSTRAINT "Acidente_userId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "atendimento_via" TEXT,
ADD COLUMN     "data_acidente" TIMESTAMP(3),
ADD COLUMN     "hospital" TEXT,
ADD COLUMN     "lesoes" TEXT,
ADD COLUMN     "outro_hospital" TEXT;

-- DropTable
DROP TABLE "Acidente";

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "cor" TEXT NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubMessage" (
    "id" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,

    CONSTRAINT "SubMessage_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SubMessage" ADD CONSTRAINT "SubMessage_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

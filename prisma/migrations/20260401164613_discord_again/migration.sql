/*
  Warnings:

  - You are about to drop the `Discord` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "Discord";

-- CreateTable
CREATE TABLE "discord" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "executeAt" TIMESTAMP(3) NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "nome" TEXT,
    "telefone" TEXT,
    "evento" TEXT,
    "hours" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "discord_pkey" PRIMARY KEY ("id")
);

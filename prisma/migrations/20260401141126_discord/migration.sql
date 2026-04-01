-- CreateTable
CREATE TABLE "Discord" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "executeAt" TIMESTAMP(3) NOT NULL,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "Discord_pkey" PRIMARY KEY ("id")
);

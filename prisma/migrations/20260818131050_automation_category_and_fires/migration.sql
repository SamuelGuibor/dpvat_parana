-- AlterTable
ALTER TABLE "automations" ADD COLUMN     "category" TEXT;

-- CreateTable
CREATE TABLE "automation_fires" (
    "id" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "automation_fires_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "automation_fires_automationId_cardId_key" ON "automation_fires"("automationId", "cardId");

-- AddForeignKey
ALTER TABLE "automation_fires" ADD CONSTRAINT "automation_fires_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "automations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


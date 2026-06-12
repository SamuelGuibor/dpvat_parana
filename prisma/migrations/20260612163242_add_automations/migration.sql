-- CreateTable
CREATE TABLE "automations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "triggerLabelId" TEXT NOT NULL,
    "cardType" TEXT NOT NULL DEFAULT 'both',
    "conditionLogic" TEXT NOT NULL DEFAULT 'AND',
    "conditions" JSONB NOT NULL DEFAULT '[]',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automations_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "automations" ADD CONSTRAINT "automations_triggerLabelId_fkey" FOREIGN KEY ("triggerLabelId") REFERENCES "Label"("id") ON DELETE CASCADE ON UPDATE CASCADE;

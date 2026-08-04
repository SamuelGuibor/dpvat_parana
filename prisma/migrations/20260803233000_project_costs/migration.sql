-- CreateTable
CREATE TABLE "project_costs" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "description" TEXT,
    "chargedAt" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "amountBrlCents" INTEGER NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_costs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_costs_chargedAt_idx" ON "project_costs"("chargedAt");

-- CreateIndex
CREATE INDEX "project_costs_service_idx" ON "project_costs"("service");

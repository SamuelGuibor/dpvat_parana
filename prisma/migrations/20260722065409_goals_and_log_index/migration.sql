-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "metric" TEXT NOT NULL DEFAULT 'contratos',
    "target" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "goals_month_metric_key" ON "goals"("month", "metric");

-- CreateIndex
CREATE INDEX "logs_action_createdAt_idx" ON "logs"("action", "createdAt");

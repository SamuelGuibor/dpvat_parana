-- AlterTable
ALTER TABLE "project_costs" ADD COLUMN     "periodKey" TEXT,
ADD COLUMN     "scheduleId" TEXT;


-- CreateTable
CREATE TABLE "payment_schedules" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "description" TEXT,
    "dayFrom" INTEGER NOT NULL,
    "dayTo" INTEGER NOT NULL,
    "minCents" INTEGER NOT NULL,
    "maxCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "recurrence" TEXT NOT NULL DEFAULT 'MONTHLY',
    "month" INTEGER,
    "startMonth" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_schedules_active_idx" ON "payment_schedules"("active");

-- CreateIndex
CREATE UNIQUE INDEX "project_costs_scheduleId_periodKey_key" ON "project_costs"("scheduleId", "periodKey");

-- AddForeignKey
ALTER TABLE "project_costs" ADD CONSTRAINT "project_costs_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "payment_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;


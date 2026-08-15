-- AlterTable
ALTER TABLE "User" ADD COLUMN     "workSchedule" JSONB;

-- AlterTable
ALTER TABLE "WorkSession" ADD COLUMN     "autoClosed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "breaks" JSONB,
ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "editedById" TEXT,
ADD COLUMN     "note" TEXT;

-- CreateIndex
CREATE INDEX "WorkSession_date_idx" ON "WorkSession"("date");

-- CreateIndex
CREATE INDEX "WorkSession_userId_date_idx" ON "WorkSession"("userId", "date");


-- AlterTable
ALTER TABLE "op_requests" ADD COLUMN     "clientKey" TEXT;

-- AlterTable
ALTER TABLE "op_tool_calls" ADD COLUMN     "avisos" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "previaHash" TEXT;


-- CreateTable
CREATE TABLE "op_jobs" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "sessionId" TEXT,
    "args" JSONB NOT NULL,
    "itens" JSONB NOT NULL,
    "total" INTEGER NOT NULL,
    "feitos" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "claimedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "vistoEm" TIMESTAMP(3),
    "erro" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "op_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "op_jobs_status_createdAt_idx" ON "op_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "op_jobs_operatorId_createdAt_idx" ON "op_jobs"("operatorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "op_requests_clientKey_key" ON "op_requests"("clientKey");

-- CreateIndex
CREATE INDEX "op_tool_calls_previaHash_idx" ON "op_tool_calls"("previaHash");


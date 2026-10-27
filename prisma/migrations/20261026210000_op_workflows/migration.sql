
-- CreateTable
CREATE TABLE "op_workflows" (
    "id" TEXT NOT NULL,
    "workflow" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "startedById" TEXT NOT NULL,
    "lastOperatorId" TEXT NOT NULL,
    "operatorIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "originRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "op_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "op_workflows_originRequestId_key" ON "op_workflows"("originRequestId");

-- CreateIndex
CREATE INDEX "op_workflows_cardId_workflow_status_idx" ON "op_workflows"("cardId", "workflow", "status");

-- CreateIndex
CREATE INDEX "op_workflows_status_updatedAt_idx" ON "op_workflows"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "op_workflows_startedById_createdAt_idx" ON "op_workflows"("startedById", "createdAt");


-- Copia os fluxos que já existiam em op_requests.state (Etapa 6). O id do
-- fluxo continua o mesmo (= id do prompt de origem). Nada é apagado de
-- op_requests: o state antigo fica como estava e deixa de ser lido.
INSERT INTO "op_workflows" ("id", "workflow", "cardId", "status", "state", "startedById", "lastOperatorId", "operatorIds", "originRequestId", "createdAt", "updatedAt")
SELECT r."id", r."state"->>'workflow', r."state"->'card'->>'id', r."state"->>'status', r."state",
       r."operatorId", r."operatorId", ARRAY[r."operatorId"], r."id", r."createdAt",
       COALESCE((r."state"->>'atualizadoEm')::timestamp, r."createdAt")
FROM "op_requests" r
WHERE r."state" IS NOT NULL
  AND r."state"->>'workflow' IS NOT NULL
  AND r."state"->'card'->>'id' IS NOT NULL
  AND r."state"->>'status' IS NOT NULL
ON CONFLICT ("id") DO NOTHING;

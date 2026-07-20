-- Tickets de report para os devs do site (bug, alteração, melhoria...).
-- Fluxo: EM_DISTRIBUICAO -> EM_ANALISE -> EM_DESENVOLVIMENTO -> CONCLUIDO.
CREATE TABLE "dev_tickets" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'BUG',
    "status" TEXT NOT NULL DEFAULT 'EM_DISTRIBUICAO',
    "imageKey" TEXT,
    "imageName" TEXT,
    "creatorId" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "assigneeId" TEXT,
    "assigneeName" TEXT,
    "concludedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dev_tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dev_tickets_status_idx" ON "dev_tickets"("status");

CREATE INDEX "dev_tickets_assigneeId_idx" ON "dev_tickets"("assigneeId");

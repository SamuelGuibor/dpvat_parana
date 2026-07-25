-- CreateTable
CREATE TABLE "whatsapp_rule_events" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'rule',
    "ruleId" TEXT,
    "ruleText" TEXT,
    "section" TEXT,
    "playbookVersion" INTEGER,
    "contactId" TEXT NOT NULL,
    "contactName" TEXT,
    "botState" TEXT,
    "action" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_rule_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_rule_events_kind_createdAt_idx" ON "whatsapp_rule_events"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_rule_events_ruleId_createdAt_idx" ON "whatsapp_rule_events"("ruleId", "createdAt");

-- CreateIndex
CREATE INDEX "whatsapp_rule_events_contactId_idx" ON "whatsapp_rule_events"("contactId");


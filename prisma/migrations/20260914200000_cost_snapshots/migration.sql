-- Consumo diário por serviço (APIs dos provedores / logs de IA) — painel de custos com projeção.
CREATE TABLE IF NOT EXISTS "cost_snapshots" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "source" TEXT NOT NULL,
    "detail" JSONB,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cost_snapshots_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "cost_snapshots_service_day_key" ON "cost_snapshots"("service", "day");
CREATE INDEX IF NOT EXISTS "cost_snapshots_day_idx" ON "cost_snapshots"("day");

-- Ajustes do banco de horas (compensação/abono)
CREATE TABLE "ponto_adjustments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'compensation',
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ponto_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ponto_adjustments_userId_date_idx" ON "ponto_adjustments"("userId", "date");

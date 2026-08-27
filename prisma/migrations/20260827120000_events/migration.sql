-- Agenda de eventos da equipe (ícone "Eventos" no cabeçalho da nova-dash):
-- horários em que clientes virão ao escritório, perícias, audiências.
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "location" TEXT,
    "clientName" TEXT,
    "userId" TEXT,
    "processId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- A lista do modal sempre ordena/filtra por início.
CREATE INDEX "events_startsAt_idx" ON "events"("startsAt");

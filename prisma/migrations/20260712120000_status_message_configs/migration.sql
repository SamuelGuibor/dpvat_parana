-- Config das mensagens automáticas de progressão de status (por serviceKey+status)
CREATE TABLE "status_message_configs" (
    "id" TEXT NOT NULL,
    "serviceKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "customText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "status_message_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "status_message_configs_serviceKey_status_key"
    ON "status_message_configs"("serviceKey", "status");

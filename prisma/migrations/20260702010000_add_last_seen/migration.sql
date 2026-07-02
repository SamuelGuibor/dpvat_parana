-- Heartbeat de presença: guarda o último "sinal de vida" do usuário
-- (app aberto) para indicar quem está online no momento.
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);

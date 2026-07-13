-- Modo "aviso": só o dono do canal pode enviar mensagens; demais membros só leem.
ALTER TABLE "chat_channels" ADD COLUMN "announceOnly" BOOLEAN NOT NULL DEFAULT false;

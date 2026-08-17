-- Marcação manual dos leads do BotConversa (aba do Espaço de Trabalho)
ALTER TABLE "Botconversa" ADD COLUMN "marcado" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Botconversa" ADD COLUMN "marcadoEm" TIMESTAMP(3);
ALTER TABLE "Botconversa" ADD COLUMN "marcadoPor" TEXT;

-- Campos de controle de afastamento: data de vencimento e flag de notificação.
-- afastadoAte: data em que o afastamento termina (vencimento).
-- afastadoNotificado: evita gerar a notificação de vencimento mais de uma vez.
ALTER TABLE "User" ADD COLUMN "afastadoAte" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "afastadoNotificado" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Process" ADD COLUMN "afastadoAte" TIMESTAMP(3);
ALTER TABLE "Process" ADD COLUMN "afastadoNotificado" BOOLEAN NOT NULL DEFAULT false;

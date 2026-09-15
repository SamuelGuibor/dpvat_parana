-- Pausa por numero dos envios de TEMPLATE (pagos). Texto livre na janela de
-- 24h e o webhook seguem normais. Motivacao (15/09/2026): o numero
-- +55 41 9786-2323 ("Parana DPVAT BOT") esta com o pagamento da WABA
-- configurado errado e cada template vira custo indevido.
ALTER TABLE "whatsapp_numbers" ADD COLUMN "templatesPaused" BOOLEAN NOT NULL DEFAULT false;

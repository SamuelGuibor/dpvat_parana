-- Várias fotos por ticket: array JSON de { key, name } (chaves no S3, prefixo dev-tickets/).
ALTER TABLE "dev_tickets" ADD COLUMN "images" JSONB;

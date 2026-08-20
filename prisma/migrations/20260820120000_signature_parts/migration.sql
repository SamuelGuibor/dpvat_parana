-- Fronteiras de página por documento no PDF de assinatura (+ chaves S3 dos
-- PDFs separados pós-assinatura).
ALTER TABLE "signature_requests" ADD COLUMN "parts" JSONB;

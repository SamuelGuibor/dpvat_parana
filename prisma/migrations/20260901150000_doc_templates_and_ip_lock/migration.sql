-- Modelos .docx gerenciáveis (Gerar Procuração) — sobrepõe a pasta templates/.
CREATE TABLE "doc_templates" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "label" TEXT,
    "s3Key" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doc_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "doc_templates_filename_key" ON "doc_templates"("filename");

-- Trava de IP da dashboard: pré-configura os IPs do escritório (IPv4 exato +
-- prefixo IPv6, que muda de sufixo o tempo todo). Lista editável na seção
-- Segurança do Espaço de Trabalho; vazia = trava desligada.
INSERT INTO "app_settings" ("key", "value", "updatedAt")
VALUES ('dashboard_allowed_ips', E'177.1.17.71\n2804:d55:830c:2900:*', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

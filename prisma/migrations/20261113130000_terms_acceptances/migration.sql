-- Aceite de termos pelo WhatsApp (comprovante em PDF), T-B40K0.

-- CreateTable
CREATE TABLE "terms_acceptances" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "numberId" TEXT,
    "phone" TEXT NOT NULL,
    "userId" TEXT,
    "termsVersion" TEXT NOT NULL,
    "formVersionId" TEXT,
    "waMessageId" TEXT NOT NULL,
    "flowToken" TEXT,
    "nameGiven" TEXT,
    "cpfGiven" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "recordHash" TEXT NOT NULL,
    "pdfSha256" TEXT,
    "pdfKey" TEXT,
    "documentId" TEXT,
    "responseJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "terms_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "terms_acceptances_code_key" ON "terms_acceptances"("code");

-- CreateIndex
CREATE UNIQUE INDEX "terms_acceptances_waMessageId_key" ON "terms_acceptances"("waMessageId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "terms_acceptances_userId_idx" ON "terms_acceptances"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "terms_acceptances_phone_idx" ON "terms_acceptances"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "terms_acceptances_contactId_termsVersion_key" ON "terms_acceptances"("contactId", "termsVersion");

-- Tag de card que diz "a ZapSign voltou assinada" (decisão do dono, 13/11):
-- a trava do kanban (terms-gate.ts) confere este NOME.
INSERT INTO "card_tags" ("id", "name", "color", "createdAt")
VALUES ('tag_zapsign_assinado', 'ZAPSIGN ASSINADO', '#16a34a', CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;

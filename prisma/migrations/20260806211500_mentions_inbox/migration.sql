-- Caixa de Menções e Tarefas: cada @menção vira uma linha com estado próprio.
CREATE TABLE "mentions" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'comment',
    "excerpt" TEXT NOT NULL,
    "commentId" TEXT,
    "userId" TEXT,
    "processId" TEXT,
    "targetName" TEXT NOT NULL,
    "chatMessageId" TEXT,
    "channelId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "ackAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mentions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mentions_recipientId_status_idx" ON "mentions"("recipientId", "status");
CREATE INDEX "mentions_recipientId_createdAt_idx" ON "mentions"("recipientId", "createdAt");

ALTER TABLE "mentions" ADD CONSTRAINT "mentions_recipientId_fkey"
  FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: as menções que já existem no sino viram itens da caixa (as que o
-- usuário já limpou do sino se perderam, mas dali pra frente nada some).
-- Menções em comentários de card: o texto do comentário é o trecho.
INSERT INTO "mentions" (
  "id", "recipientId", "authorId", "authorName", "source", "excerpt",
  "commentId", "userId", "processId", "targetName", "status", "createdAt"
)
SELECT
  n."id",
  n."recipientId",
  n."authorId",
  n."authorName",
  'comment',
  LEFT(regexp_replace(COALESCE(c."text", n."message"), '@\[(.+?)\]\(([^)]+)\)', '@\1', 'g'), 500),
  n."commentId",
  n."userId",
  n."processId",
  n."targetName",
  CASE WHEN n."read" THEN 'ACK' ELSE 'PENDING' END,
  n."createdAt"
FROM "Notification" n
LEFT JOIN "Comment" c ON c."id" = n."commentId"
WHERE n."commentId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = n."recipientId");

-- Menções no chat da equipe (não têm commentId; identificadas pelo alvo).
INSERT INTO "mentions" (
  "id", "recipientId", "authorId", "authorName", "source", "excerpt",
  "targetName", "status", "createdAt"
)
SELECT
  n."id",
  n."recipientId",
  n."authorId",
  n."authorName",
  'chat',
  LEFT(n."message", 500),
  n."targetName",
  CASE WHEN n."read" THEN 'ACK' ELSE 'PENDING' END,
  n."createdAt"
FROM "Notification" n
WHERE n."commentId" IS NULL
  AND n."targetName" = 'Chat da equipe'
  AND EXISTS (SELECT 1 FROM "User" u WHERE u."id" = n."recipientId");

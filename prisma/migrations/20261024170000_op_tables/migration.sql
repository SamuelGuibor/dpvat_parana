-- CreateTable
CREATE TABLE "operator_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operator_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "op_sessions" (
    "id" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "clientSessionId" TEXT NOT NULL,
    "cwd" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "op_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "op_requests" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "operatorId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "skill" TEXT,
    "state" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "op_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "op_tool_calls" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "sessionId" TEXT,
    "operatorId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "args" JSONB NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "code" TEXT,
    "summary" TEXT NOT NULL,
    "cardIds" TEXT[],
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "op_tool_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operator_tokens_tokenHash_key" ON "operator_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "operator_tokens_userId_idx" ON "operator_tokens"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "op_sessions_clientSessionId_key" ON "op_sessions"("clientSessionId");

-- CreateIndex
CREATE INDEX "op_sessions_operatorId_lastSeenAt_idx" ON "op_sessions"("operatorId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "op_requests_operatorId_createdAt_idx" ON "op_requests"("operatorId", "createdAt");

-- CreateIndex
CREATE INDEX "op_requests_sessionId_idx" ON "op_requests"("sessionId");

-- CreateIndex
CREATE INDEX "op_tool_calls_operatorId_createdAt_idx" ON "op_tool_calls"("operatorId", "createdAt");

-- CreateIndex
CREATE INDEX "op_tool_calls_tool_createdAt_idx" ON "op_tool_calls"("tool", "createdAt");

-- CreateIndex
CREATE INDEX "op_tool_calls_sessionId_idx" ON "op_tool_calls"("sessionId");

-- AddForeignKey
ALTER TABLE "operator_tokens" ADD CONSTRAINT "operator_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "op_requests" ADD CONSTRAINT "op_requests_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "op_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "op_tool_calls" ADD CONSTRAINT "op_tool_calls_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "op_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "op_tool_calls" ADD CONSTRAINT "op_tool_calls_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "op_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;


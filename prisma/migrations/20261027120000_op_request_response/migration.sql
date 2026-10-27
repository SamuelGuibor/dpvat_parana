-- 27/10: resposta final do app ao prompt do operador (hook Stop op-response.mjs).
ALTER TABLE "op_requests" ADD COLUMN IF NOT EXISTS "respondedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "response" TEXT;

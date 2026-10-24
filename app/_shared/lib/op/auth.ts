// Identidade do operador da IA de operação (Claude Code → /api/op/*).
//
// O app não tem cookie do NextAuth: cada membro da equipe recebe um token
// próprio (decisão 2), gerado na tela Equipe e guardado numa variável de
// ambiente DO USUÁRIO (CRM_OP_TOKEN) — nunca no repo nem no .env do projeto.
// No banco fica só o sha256. O token resolve para o User real da pessoa e as
// permissões saem do banco (resolvePermissions), como no getSessionPermissions.
//
// Trava de IP: NÃO se aplica aqui (decisão 3 — bypass por token + permissão do
// banco). O que limita o operador é a permissão de cada ferramenta.

import { createHash, randomBytes } from "crypto";
import { db } from "../prisma";
import { isManager } from "../managers";
import { isAiReviewer } from "../ai-review-access";
import { isTeamRole, resolvePermissions, type PermissionKey, type PermissionMap } from "../permissions";
import { rateLimit } from "../rate-limit";
import { runAfterResponse } from "../background";
import { AccessError } from "@/app/_shared/utils/route-guards";

export const OP_TOKEN_PREFIX = "crmop_";

/** lastUsedAt só é regravado depois deste intervalo (evita 1 UPDATE por ferramenta). */
const LAST_USED_TOUCH_MS = 5 * 60_000;

export interface OperatorContext {
  userId: string;
  name: string | null;
  email: string;
  role: string;
  permissions: PermissionMap;
  tokenId: string;
}

/** Falha de autenticação/limite da API de operação (status HTTP + código estável). */
export class OpAuthError extends Error {
  constructor(
    public status: 401 | 403 | 429,
    public code: "sem_token" | "token_invalido" | "token_revogado" | "sem_permissao" | "limite",
    message: string,
  ) {
    super(message);
    this.name = "OpAuthError";
  }
}

export function generateOperatorToken(): string {
  return OP_TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

export function hashOperatorToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** "Bearer crmop_..." → token; qualquer outra coisa → null. */
export function parseBearer(header: string | null | undefined): string | null {
  const m = header?.match(/^Bearer\s+(\S+)\s*$/i);
  if (!m || !m[1].startsWith(OP_TOKEN_PREFIX)) return null;
  return m[1];
}

export interface TokenRow {
  id: string;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  user: { id: string; name: string | null; email: string; role: string; permissions: unknown } | null;
}

/**
 * Decisão pura sobre a linha do token (testada em tests/op-auth.test.ts):
 * inexistente → 401; revogado → 401; dono que não é mais da equipe (cliente,
 * GHOST, rebaixado a card) → 403. Mesmas regras de allowlist de e-mail do
 * getSessionPermissions (isManager concede, isAiReviewer só restringe).
 */
export function operatorFromTokenRow(row: TokenRow | null): OperatorContext {
  if (!row) throw new OpAuthError(401, "token_invalido", "Token do app inválido.");
  if (row.revokedAt) throw new OpAuthError(401, "token_revogado", "Token do app revogado. Gere outro na tela Equipe.");
  const user = row.user;
  if (!user || !isTeamRole(user.role)) {
    throw new OpAuthError(403, "sem_permissao", "Este token não pertence a um membro da equipe.");
  }
  const permissions = resolvePermissions(user.role, user.permissions);
  if (!permissions.manager_dashboard && isManager(user.email)) permissions.manager_dashboard = true;
  if (permissions.review_ai && !isAiReviewer(user.email)) permissions.review_ai = false;
  return { userId: user.id, name: user.name, email: user.email, role: user.role, permissions, tokenId: row.id };
}

function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "desconhecido";
}

/** Lê o Bearer, confere o hash no banco e devolve o operador. Lança OpAuthError. */
export async function resolveOperator(req: Request): Promise<OperatorContext> {
  const token = parseBearer(req.headers.get("authorization"));
  if (!token) {
    throw new OpAuthError(401, "sem_token", "Falta o token do app (variável CRM_OP_TOKEN).");
  }
  const tokenHash = hashOperatorToken(token);
  // Limite por token (uso normal) e por IP (chute de token).
  if (!rateLimit(`op:${tokenHash}`, 120, 60_000) || !rateLimit(`op-ip:${clientIp(req)}`, 300, 60_000)) {
    throw new OpAuthError(429, "limite", "Muitas chamadas em sequência. Espere um minuto.");
  }

  const row = await db.operatorToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { id: true, name: true, email: true, role: true, permissions: true } },
    },
  });
  const ctx = operatorFromTokenRow(row);

  if (!row!.lastUsedAt || Date.now() - row!.lastUsedAt.getTime() > LAST_USED_TOUCH_MS) {
    runAfterResponse("op_token_last_used", () =>
      db.operatorToken.update({ where: { id: row!.id }, data: { lastUsedAt: new Date() } }),
    );
  }
  return ctx;
}

/** Exige uma permissão do operador; recusa = AccessError (rota responde 403 sem_permissao). */
export function requireOpPermission(ctx: OperatorContext, key: PermissionKey): void {
  if (!ctx.permissions[key]) throw new AccessError("Você não tem permissão para esta ação.");
}

/**
 * Gera um token para um membro da equipe. Devolve o token em claro UMA vez;
 * no banco fica só o hash.
 */
export async function issueOperatorToken(
  userId: string,
  label: string,
  createdById: string,
): Promise<{ id: string; token: string }> {
  const token = generateOperatorToken();
  const row = await db.operatorToken.create({
    data: { userId, label: label.trim().slice(0, 80) || "Claude Code", tokenHash: hashOperatorToken(token), createdById },
    select: { id: true },
  });
  return { id: row.id, token };
}

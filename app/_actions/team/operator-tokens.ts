"use server";

// Tokens do app (Claude Code) por membro da equipe — tela Equipe.
// Só quem gerencia a equipe gera e revoga: o token dispensa a trava de IP
// (decisão 3), então emitir um é decisão do Super Admin, não do próprio membro.

import { db } from "@/app/_shared/lib/prisma";
import { requirePermission } from "@/app/_shared/lib/permissions-server";
import { isTeamRole } from "@/app/_shared/lib/permissions";
import { issueOperatorToken } from "@/app/_shared/lib/op/auth";
import { createLog } from "@/app/_shared/lib/log";

export interface OperatorTokenDTO {
  id: string;
  userId: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** Tokens (ativos e revogados) de toda a equipe, mais recentes primeiro. */
export async function listOperatorTokens(): Promise<OperatorTokenDTO[]> {
  await requirePermission("manage_team");
  const rows = await db.operatorToken.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, userId: true, label: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    label: r.label,
    createdAt: r.createdAt.toISOString(),
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    revokedAt: r.revokedAt?.toISOString() ?? null,
  }));
}

/** Gera um token para o membro. O texto em claro volta só nesta resposta. */
export async function createOperatorToken(
  userId: string,
  label: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const ctx = await requirePermission("manage_team");
  const member = await db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true } });
  if (!member || !isTeamRole(member.role)) return { ok: false, error: "Só membros da equipe recebem token do app." };

  const { id, token } = await issueOperatorToken(member.id, label, ctx.userId);
  await createLog({
    action: "update",
    message: `${ctx.name ?? "Super Admin"} gerou um token do app para ${member.name ?? "membro"}`,
    authorId: ctx.userId,
    authorName: ctx.name ?? "",
    metadata: { stage: "operator_token", op: "create", tokenId: id, targetUserId: member.id },
  });
  return { ok: true, token };
}

/** Revoga na hora: a próxima chamada do app com esse token leva 401. */
export async function revokeOperatorToken(tokenId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await requirePermission("manage_team");
  const row = await db.operatorToken.findUnique({
    where: { id: tokenId },
    select: { id: true, revokedAt: true, userId: true, user: { select: { name: true } } },
  });
  if (!row) return { ok: false, error: "Token não encontrado." };
  if (row.revokedAt) return { ok: true };
  await db.operatorToken.update({ where: { id: row.id }, data: { revokedAt: new Date() } });
  await createLog({
    action: "update",
    message: `${ctx.name ?? "Super Admin"} revogou um token do app de ${row.user.name ?? "membro"}`,
    authorId: ctx.userId,
    authorName: ctx.name ?? "",
    metadata: { stage: "operator_token", op: "revoke", tokenId: row.id, targetUserId: row.userId },
  });
  return { ok: true };
}

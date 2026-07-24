import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { db } from "./prisma";
import { isManager } from "./managers";
import { isAiReviewer } from "./ai-review-access";
import {
  isTeamRole,
  resolvePermissions,
  type PermissionKey,
  type PermissionMap,
} from "./permissions";

export interface SessionPermissions {
  userId: string;
  name: string | null;
  email: string;
  role: string;
  permissions: PermissionMap;
}

/**
 * Carrega e resolve as permissões do usuário logado (equipe).
 * A "Visão do Gestor" também é concedida pela allowlist de e-mails
 * (MANAGER_EMAILS) para manter compatibilidade com o mecanismo anterior.
 */
export async function getSessionPermissions(): Promise<SessionPermissions | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const user = await db.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true, role: true, permissions: true },
  });
  if (!user || !isTeamRole(user.role)) return null;

  const permissions = resolvePermissions(user.role, user.permissions);
  if (!permissions.manager_dashboard && isManager(user.email)) {
    permissions.manager_dashboard = true;
  }
  // Revisão da IA: trava temporária por e-mail POR CIMA da permissão — hoje a
  // curadoria do cérebro é de uma pessoa só, e há mais de um ADMIN++ na equipe.
  // Só restringe; nunca concede. Ver ai-review-access.ts para liberar depois.
  if (permissions.review_ai && !isAiReviewer(user.email)) {
    permissions.review_ai = false;
  }

  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions,
  };
}

/** Exige sessão de equipe; lança se não houver. */
export async function requireTeam(): Promise<SessionPermissions> {
  const ctx = await getSessionPermissions();
  if (!ctx) throw new Error("Acesso restrito à equipe.");
  return ctx;
}

/** Exige uma permissão específica; lança com mensagem clara se faltar. */
export async function requirePermission(key: PermissionKey): Promise<SessionPermissions> {
  const ctx = await requireTeam();
  if (!ctx.permissions[key]) {
    throw new Error("Você não tem permissão para esta ação.");
  }
  return ctx;
}

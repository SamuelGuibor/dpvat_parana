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
import { checkDashboardIpAccess } from "./ip-access";

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
// Cache curto por e-mail (14/09/2026): esta função roda em TODA server action
// da equipe (via requireTeam) e em toda navegação do layout. 30s de cache por
// instância corta a consulta de usuário repetida em cada poll; uma mudança de
// permissão/role demora no máximo 30s pra valer. Nunca cacheia o "null".
const PERM_CACHE_TTL_MS = 30_000;
const permCache = new Map<string, { value: SessionPermissions; expiresAt: number }>();

export function invalidateSessionPermissionsCache(email?: string): void {
  if (email) permCache.delete(email);
  else permCache.clear();
}

export async function getSessionPermissions(): Promise<SessionPermissions | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return null;

  const cached = permCache.get(session.user.email);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

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

  const value: SessionPermissions = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    permissions,
  };
  permCache.set(user.email, { value, expiresAt: Date.now() + PERM_CACHE_TTL_MS });
  return value;
}

/**
 * Exige sessão de equipe; lança se não houver.
 * Também aplica a trava de IP da dashboard: fora dos IPs liberados, só quem
 * tem bypass_ip_lock (a página /nova-dash tem o mesmo gate no layout — aqui
 * é a defesa em profundidade que cobre todas as server actions e APIs).
 */
export async function requireTeam(): Promise<SessionPermissions> {
  const ctx = await getSessionPermissions();
  if (!ctx) throw new Error("Acesso restrito à equipe.");
  const ipCheck = await checkDashboardIpAccess(ctx.permissions.bypass_ip_lock);
  if (!ipCheck.allowed) {
    throw new Error("Acesso à dashboard permitido apenas pela internet do escritório.");
  }
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

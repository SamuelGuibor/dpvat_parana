"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/app/_shared/lib/prisma";
import {
  getSessionPermissions,
  requirePermission,
} from "@/app/_shared/lib/permissions-server";
import {
  PERMISSION_KEYS,
  parseOverrides,
  resolvePermissions,
  isTeamRole,
  type PermissionMap,
  type PermissionOverrides,
} from "@/app/_shared/lib/permissions";
import { isManager } from "@/app/_shared/lib/managers";
import { isAiReviewer } from "@/app/_shared/lib/ai-review-access";

export interface MyPermissions {
  userId: string;
  role: string;
  permissions: PermissionMap;
}

/** Permissões resolvidas do usuário logado — consumido pelo client uma vez ao montar o dash. */
export async function getMyPermissions(): Promise<MyPermissions | null> {
  const ctx = await getSessionPermissions();
  if (!ctx) return null;
  return { userId: ctx.userId, role: ctx.role, permissions: ctx.permissions };
}

export interface TeamMemberPermissions {
  id: string;
  name: string | null;
  email: string;
  role: string;
  overrides: PermissionOverrides;
  resolved: PermissionMap;
}

/** Lista da equipe com overrides + mapa resolvido (só para quem gerencia a equipe). */
export async function getTeamPermissions(): Promise<TeamMemberPermissions[]> {
  await requirePermission("manage_team");

  const members = await db.user.findMany({
    where: { role: { in: ["ADMIN", "ADMIN+", "ADMIN++"] } },
    select: { id: true, name: true, email: true, role: true, permissions: true },
    orderBy: { name: "asc" },
  });

  return members.map((m) => {
    const resolved = resolvePermissions(m.role, m.permissions);
    if (!resolved.manager_dashboard && isManager(m.email)) resolved.manager_dashboard = true;
    // Espelha a trava de getSessionPermissions: sem isto a tela mostraria
    // "Revisão da IA" ligada para os outros ADMIN++, que na prática não entram.
    if (resolved.review_ai && !isAiReviewer(m.email)) resolved.review_ai = false;
    return {
      id: m.id,
      name: m.name,
      email: m.email,
      role: m.role,
      overrides: parseOverrides(m.permissions),
      resolved,
    };
  });
}

/**
 * Grava os overrides de permissão de um membro (só ADMIN++). Passar null
 * limpa os overrides (volta ao padrão do cargo). manage_team nunca é
 * concedível por aqui.
 */
export async function setUserPermissions(
  userId: string,
  overrides: PermissionOverrides | null,
): Promise<{ success: true }> {
  await requirePermission("manage_team");

  const target = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!target || !isTeamRole(target.role)) {
    throw new Error("Usuário não é membro da equipe.");
  }

  let clean: PermissionOverrides | null = null;
  if (overrides) {
    clean = {};
    for (const key of PERMISSION_KEYS) {
      if (key === "manage_team") continue;
      const v = overrides[key];
      if (typeof v === "boolean") clean[key] = v;
    }
    if (!Object.keys(clean).length) clean = null;
  }

  await db.user.update({
    where: { id: userId },
    // Sem override => NULL no banco (DbNull), voltando ao padrão do cargo.
    data: { permissions: clean ?? Prisma.DbNull },
  });

  return { success: true };
}

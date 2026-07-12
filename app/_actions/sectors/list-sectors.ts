"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/app/_shared/lib/auth";
import { db } from "@/app/_shared/lib/prisma";
import { isSectorAdmin } from "@/app/_shared/lib/sector-admin";

export interface SectorDTO {
  id: string;
  name: string;
  slug: string;
  color: string;
  order: number;
  memberCount: number;
}

/** Lista todos os setores (qualquer usuário autenticado). Usado em menções,
 *  atribuição e dashboards. Inclui a contagem de membros. */
export async function listSectors(): Promise<SectorDTO[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Não autenticado.");

  const sectors = await db.sector.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { users: true } } },
  });

  return sectors.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
    color: s.color,
    order: s.order,
    memberCount: s._count.users,
  }));
}

/** Contexto de permissão para a UI: se o usuário logado pode gerir setores e
 *  qual o seu próprio ID (para copiar em SECTOR_ADMIN_IDS). */
export async function getSectorAdminContext(): Promise<{ canManage: boolean; myId: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Não autenticado.");
  const canManage = await isSectorAdmin(session.user.id, (session.user as { role?: string }).role);
  return { canManage, myId: session.user.id };
}

export interface AssignableUser {
  id: string;
  name: string;
  sectorId: string | null;
}

/** Usuários da equipe (roles ADMIN*) para atribuir a setores. */
export async function listAssignableUsers(): Promise<AssignableUser[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Não autenticado.");

  const users = await db.user.findMany({
    where: { role: { in: ["ADMIN", "ADMIN+", "ADMIN++"] } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, sectorId: true },
  });
  return users.map((u) => ({ id: u.id, name: u.name ?? "Sem nome", sectorId: u.sectorId }));
}

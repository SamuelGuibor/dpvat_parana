'use server';

import { db } from '@/app/_shared/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';

export interface TeamProfile {
  id: string;
  name: string;
  email: string | null;
  telefone: string | null;
  role: string;
  image: string | null;
}

/**
 * Perfis básicos de colegas de equipe (nome, telefone, role, foto) por id.
 * Requer sessão — qualquer membro autenticado pode ver o perfil de outro
 * (mesmo dado já exposto por /api/admins e /api/presence, só que completo).
 */
export async function getTeamProfiles(ids: string[]): Promise<TeamProfile[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Não autenticado.');
  if (ids.length === 0) return [];

  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, name: true, email: true, telefone: true, role: true, image: true },
  });

  return users.map((u) => ({
    id: u.id,
    name: u.name ?? 'Usuário',
    email: u.email ?? null,
    telefone: u.telefone ?? null,
    role: u.role ?? '',
    image: u.image ?? null,
  }));
}

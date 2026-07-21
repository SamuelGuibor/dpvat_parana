'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';
import { createLog } from '@/app/_shared/lib/log';

// Alertas do time de DESENVOLVIMENTO para a equipe: pop-up na tela de quem
// está online (ex.: "dê F5, saiu atualização") ou notificação no sino de
// todos. Criação restrita a quem pertence ao setor de desenvolvimento.

const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++'];
// Pop-up vale por 2h: quem abrir o painel depois disso não vê aviso velho.
const POPUP_TTL_MS = 2 * 60 * 60 * 1000;

function isDevSectorName(name: string | null | undefined): boolean {
  const n = (name ?? '').toLowerCase();
  return n.includes('desenvolv') || n === 'dev' || n === 'ti';
}

async function requireDevMember(): Promise<{ id: string; name: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Não autenticado.');
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, role: true, sector: { select: { name: true, slug: true } } },
  });
  if (!user || !TEAM_ROLES.includes(user.role)) throw new Error('Sem permissão.');
  if (!isDevSectorName(user.sector?.name) && !isDevSectorName(user.sector?.slug)) {
    throw new Error('Apenas o setor de desenvolvimento pode criar alertas.');
  }
  return { id: user.id, name: user.name ?? 'Dev' };
}

export interface DevAlertDTO {
  id: string;
  title: string | null;
  message: string;
  authorName: string;
  createdAt: string;
}

export async function createDevAlert(input: {
  type: 'popup' | 'notification';
  title?: string;
  message: string;
}): Promise<{ ok: true; recipients?: number }> {
  const me = await requireDevMember();
  const message = input.message.trim();
  const title = input.title?.trim() || null;
  if (!message) throw new Error('Escreva o conteúdo do alerta.');
  if (message.length > 1000) throw new Error('Alerta longo demais (máx. 1000 caracteres).');

  if (input.type === 'popup') {
    await db.devAlert.create({
      data: {
        title,
        message,
        authorId: me.id,
        authorName: me.name,
        expiresAt: new Date(Date.now() + POPUP_TTL_MS),
      },
    });
    await createLog({
      action: 'update',
      message: `disparou um pop-up de aviso para a equipe${title ? `: "${title}"` : ''}`,
      authorId: me.id,
      authorName: me.name,
    });
    return { ok: true };
  }

  // Notificação no sino: uma por membro da equipe (o autor não precisa).
  const team = await db.user.findMany({
    where: { role: { in: TEAM_ROLES }, id: { not: me.id } },
    select: { id: true },
  });
  await db.notification.createMany({
    data: team.map((u) => ({
      recipientId: u.id,
      authorId: me.id,
      authorName: `🛠️ ${me.name} (Dev)`,
      targetName: 'Equipe',
      message: title ? `${title} — ${message}` : message,
    })),
  });
  await createLog({
    action: 'update',
    message: `enviou uma notificação de aviso para ${team.length} membros da equipe${title ? `: "${title}"` : ''}`,
    authorId: me.id,
    authorName: me.name,
  });
  return { ok: true, recipients: team.length };
}

/** Pop-ups ainda válidos — o UserMenu consulta a cada ~30s para quem está online. */
export async function getActiveDevAlerts(): Promise<DevAlertDTO[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return [];
  const alerts = await db.devAlert.findMany({
    where: { expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: 10,
    select: { id: true, title: true, message: true, authorName: true, createdAt: true },
  });
  return alerts.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }));
}

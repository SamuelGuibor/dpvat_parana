'use server';

import { db } from '@/app/_shared/lib/prisma';
import { authOptions } from '@/app/_shared/lib/auth';
import { getServerSession } from 'next-auth';
import { requirePermission } from '@/app/_shared/lib/permissions-server';

export type MentionStatus = 'PENDING' | 'ACK' | 'DONE';

export interface MentionDTO {
  id: string;
  authorId: string | null;
  authorName: string;
  authorImage: string | null;
  source: 'comment' | 'chat';
  excerpt: string;
  commentId: string | null;
  /** Card do tipo "usuário" (lead) — usado para abrir o card no Kanban. */
  userId: string | null;
  /** Card do tipo "processo" — usado para abrir o card no Kanban. */
  processId: string | null;
  targetName: string;
  channelId: string | null;
  status: MentionStatus;
  ackAt: string | null;
  doneAt: string | null;
  createdAt: string;
  /** Nº do card no Kanban, quando a origem é um comentário de card. */
  cardNumber: number | null;
  /** Status atual do card (etapa), só informativo na tabela. */
  cardStatus: string | null;
  /** False quando o card foi apagado depois da menção. */
  targetExists: boolean;
  /** Quem foi marcado. Só vem preenchido na visão de equipe. */
  recipientId?: string;
  recipientName?: string;
  recipientImage?: string | null;
}

/** Lista as menções do usuário logado, mais recentes primeiro. */
export async function listMyMentions(limit = 200): Promise<MentionDTO[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return [];

  const rows = await db.mention.findMany({
    where: { recipientId: session.user.id },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 500),
  });

  return enrich(rows);
}

/**
 * Visão de supervisão: as menções de TODA a equipe (permissão
 * `view_all_mentions`, do ADMIN++ por padrão). Só leitura — quem marca ciente
 * ou conclui é sempre a pessoa mencionada.
 */
export async function listTeamMentions(limit = 400): Promise<MentionDTO[]> {
  await requirePermission('view_all_mentions');

  const rows = await db.mention.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 1000),
  });

  const dtos = await enrich(rows);

  // Nome/foto de quem foi marcado — a coluna que só existe nesta visão.
  const recipientIds = [...new Set(rows.map((r) => r.recipientId))];
  const recipients = recipientIds.length
    ? await db.user.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true, name: true, image: true },
    })
    : [];
  const recipientMap = new Map(recipients.map((u) => [u.id, u]));

  return dtos.map((dto, i) => {
    const person = recipientMap.get(rows[i].recipientId);
    return {
      ...dto,
      recipientId: rows[i].recipientId,
      recipientName: person?.name ?? 'Usuário removido',
      recipientImage: person?.image ?? null,
    };
  });
}

type MentionRow = Awaited<ReturnType<typeof db.mention.findMany>>[number];

/** Enriquecimento em lote: avatar de quem mencionou + situação do card. */
async function enrich(rows: MentionRow[]): Promise<MentionDTO[]> {
  const authorIds = [...new Set(rows.map((r) => r.authorId).filter((id): id is string => !!id))];
  const userCardIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => !!id))];
  const processIds = [...new Set(rows.map((r) => r.processId).filter((id): id is string => !!id))];

  const [authors, userCards, processes] = await Promise.all([
    authorIds.length
      ? db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, image: true } })
      : Promise.resolve([]),
    userCardIds.length
      ? db.user.findMany({ where: { id: { in: userCardIds } }, select: { id: true, cardNumber: true, status: true } })
      : Promise.resolve([]),
    processIds.length
      ? db.process.findMany({ where: { id: { in: processIds } }, select: { id: true, cardNumber: true, status: true } })
      : Promise.resolve([]),
  ]);

  const authorMap = new Map(authors.map((a) => [a.id, a.image]));
  const userMap = new Map(userCards.map((u) => [u.id, u]));
  const processMap = new Map(processes.map((p) => [p.id, p]));

  return rows.map((r) => {
    const card = r.processId ? processMap.get(r.processId) : r.userId ? userMap.get(r.userId) : null;
    const isCardMention = !!(r.processId || r.userId);
    return {
      id: r.id,
      authorId: r.authorId,
      authorName: r.authorName,
      authorImage: r.authorId ? authorMap.get(r.authorId) ?? null : null,
      source: r.source === 'chat' ? 'chat' : 'comment',
      excerpt: r.excerpt,
      commentId: r.commentId,
      userId: r.userId,
      processId: r.processId,
      targetName: r.targetName,
      channelId: r.channelId,
      status: (r.status as MentionStatus) ?? 'PENDING',
      ackAt: r.ackAt?.toISOString() ?? null,
      doneAt: r.doneAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      cardNumber: card?.cardNumber ?? null,
      cardStatus: card?.status ?? null,
      targetExists: isCardMention ? !!card : true,
    };
  });
}

/** Quantas menções ainda estão pendentes (badge da aba). */
export async function countPendingMentions(): Promise<number> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return 0;

  return db.mention.count({
    where: { recipientId: session.user.id, status: 'PENDING' },
  });
}

/**
 * Muda o estado de uma menção. PENDING → ACK (tomei ciência) → DONE (resolvi);
 * voltar para PENDING limpa as duas datas.
 */
export async function setMentionStatus(id: string, status: MentionStatus): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Não autenticado');

  const now = new Date();
  // updateMany (e não update) garante que ninguém mexe na menção de outra pessoa.
  const where = { id, recipientId: session.user.id };

  if (status === 'PENDING') {
    await db.mention.updateMany({ where, data: { status, ackAt: null, doneAt: null } });
    return;
  }

  if (status === 'ACK') {
    await db.mention.updateMany({ where, data: { status, ackAt: now, doneAt: null } });
    return;
  }

  // Concluir direto (sem passar por "ciente") preenche o ackAt junto.
  const current = await db.mention.findFirst({ where, select: { ackAt: true } });
  await db.mention.updateMany({
    where,
    data: { status, ackAt: current?.ackAt ?? now, doneAt: now },
  });
}

/** Marca em lote (usado pelos botões "dar ciência em todas" / "concluir"). */
export async function setManyMentionsStatus(ids: string[], status: MentionStatus): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Não autenticado');
  if (!ids.length) return;

  const now = new Date();
  await db.mention.updateMany({
    where: { id: { in: ids.slice(0, 500) }, recipientId: session.user.id },
    data:
      status === 'DONE'
        ? { status, doneAt: now, ackAt: now }
        : status === 'ACK'
          ? { status, ackAt: now, doneAt: null }
          : { status, ackAt: null, doneAt: null },
  });
}

/** Apaga as menções já concluídas (faxina da caixa). */
export async function clearDoneMentions(): Promise<number> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Não autenticado');

  const { count } = await db.mention.deleteMany({
    where: { recipientId: session.user.id, status: 'DONE' },
  });
  return count;
}

'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';

// Agenda de EVENTOS da equipe (27/08/2026) — o "Eventos" do Discord aplicado
// ao escritório: horário em que um cliente virá, uma perícia, uma audiência.
// Qualquer pessoa da equipe cria e vê; apagar é de quem criou (ou do ADMIN++).

const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++'];

async function requireTeamMember(): Promise<{ id: string; name: string; role: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');
  const role = session.user.role ?? '';
  if (!TEAM_ROLES.includes(role)) throw new Error('Sem permissão para a agenda de eventos.');
  return { id: session.user.id, name: session.user.name ?? 'Equipe', role };
}

export interface EventDTO {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  location: string | null;
  clientName: string | null;
  userId: string | null;
  processId: string | null;
  createdById: string;
  createdByName: string;
  /** Quem está vendo pode apagar/editar este evento (criador ou ADMIN++). */
  canManage: boolean;
}

export interface EventInput {
  title: string;
  /** "YYYY-MM-DDTHH:mm" (horário local de quem digitou, que é o de Brasília). */
  startsAt: string;
  endsAt?: string | null;
  location?: string | null;
  clientName?: string | null;
  description?: string | null;
  userId?: string | null;
  processId?: string | null;
}

function toDTO(
  e: {
    id: string; title: string; description: string | null; startsAt: Date; endsAt: Date | null;
    location: string | null; clientName: string | null; userId: string | null; processId: string | null;
    createdById: string; createdByName: string;
  },
  me: { id: string; role: string },
): EventDTO {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt?.toISOString() ?? null,
    location: e.location,
    clientName: e.clientName,
    userId: e.userId,
    processId: e.processId,
    createdById: e.createdById,
    createdByName: e.createdByName,
    canManage: e.createdById === me.id || me.role === 'ADMIN++',
  };
}

/** Converte o valor do <input type="datetime-local"> em Date. */
function parseLocal(value: string, field: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Data/hora inválida em ${field}.`);
  return d;
}

/**
 * Eventos FUTUROS (o que o ícone do cabeçalho mostra) — inclui o que já
 * começou hoje mas ainda não terminou, senão o compromisso das 14h sumiria
 * às 14h01, que é justamente quando alguém abre pra conferir.
 */
export async function listUpcomingEvents(): Promise<EventDTO[]> {
  const me = await requireTeamMember();
  // Janela de tolerância: eventos que começaram há até 3h continuam na lista.
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const rows = await db.event.findMany({
    where: { startsAt: { gte: since } },
    orderBy: { startsAt: 'asc' },
    take: 200,
  });
  return rows.map((e) => toDTO(e, me));
}

/** Eventos que já passaram (aba "Anteriores" do modal), do mais recente pro mais antigo. */
export async function listPastEvents(): Promise<EventDTO[]> {
  const me = await requireTeamMember();
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const rows = await db.event.findMany({
    where: { startsAt: { lt: since } },
    orderBy: { startsAt: 'desc' },
    take: 100,
  });
  return rows.map((e) => toDTO(e, me));
}

/**
 * Contador do ícone do cabeçalho: quantos eventos começam nas próximas 24h
 * (incluindo os que estão acontecendo agora).
 */
export async function countEventsSoon(): Promise<number> {
  await requireTeamMember();
  const now = Date.now();
  return db.event.count({
    where: {
      startsAt: {
        gte: new Date(now - 3 * 60 * 60 * 1000),
        lte: new Date(now + 24 * 60 * 60 * 1000),
      },
    },
  });
}

function sanitizeInput(input: EventInput) {
  const title = input.title.trim();
  if (!title) throw new Error('Dê um nome ao evento.');
  const startsAt = parseLocal(input.startsAt, 'início');
  const endsAt = input.endsAt ? parseLocal(input.endsAt, 'término') : null;
  if (endsAt && endsAt <= startsAt) throw new Error('O término precisa ser depois do início.');
  return {
    title,
    startsAt,
    endsAt,
    description: input.description?.trim() || null,
    location: input.location?.trim() || null,
    clientName: input.clientName?.trim() || null,
    userId: input.userId || null,
    processId: input.processId || null,
  };
}

export async function createEvent(input: EventInput): Promise<EventDTO> {
  const me = await requireTeamMember();
  const data = sanitizeInput(input);
  const created = await db.event.create({
    data: { ...data, createdById: me.id, createdByName: me.name },
  });
  return toDTO(created, me);
}

export async function updateEvent(id: string, input: EventInput): Promise<EventDTO> {
  const me = await requireTeamMember();
  const current = await db.event.findUnique({ where: { id }, select: { createdById: true } });
  if (!current) throw new Error('Evento não encontrado.');
  if (current.createdById !== me.id && me.role !== 'ADMIN++') {
    throw new Error('Só quem criou o evento (ou o Super Admin) pode editar.');
  }
  const updated = await db.event.update({ where: { id }, data: sanitizeInput(input) });
  return toDTO(updated, me);
}

export async function deleteEvent(id: string): Promise<void> {
  const me = await requireTeamMember();
  const current = await db.event.findUnique({ where: { id }, select: { createdById: true } });
  if (!current) return;
  if (current.createdById !== me.id && me.role !== 'ADMIN++') {
    throw new Error('Só quem criou o evento (ou o Super Admin) pode excluir.');
  }
  await db.event.delete({ where: { id } });
}

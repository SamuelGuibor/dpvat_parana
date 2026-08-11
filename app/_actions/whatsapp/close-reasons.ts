'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';

// Sub-motivos de "não qualificado" editáveis pela equipe. A key (sempre
// "nq_...") vai direto pro closeCategory da conversa; apagar um motivo não
// mexe em quem já foi encerrado com ele — o histórico continua resolvível.

const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++'];

async function requireTeamMember(): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');
  if (!TEAM_ROLES.includes(session.user.role ?? '')) {
    throw new Error('Sem permissão para o atendimento de WhatsApp.');
  }
}

export interface CloseReasonDTO {
  id: string;
  key: string;
  label: string;
}

export async function listCloseReasons(): Promise<CloseReasonDTO[]> {
  await requireTeamMember();
  const rows = await db.whatsAppCloseReason.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
  return rows.map((r) => ({ id: r.id, key: r.key, label: r.label }));
}

/** Cria um motivo novo. O rótulo vira "Não qualificada — {motivo}" e a key um
 * slug com prefixo nq_ (que é o que marca qualified=false no encerramento). */
export async function createCloseReason(motivo: string): Promise<CloseReasonDTO[]> {
  await requireTeamMember();
  const trimmed = motivo.trim().replace(/^não qualificada?\s*[—-]\s*/i, '');
  if (!trimmed) throw new Error('Escreva o motivo.');
  if (trimmed.length > 60) throw new Error('Motivo muito longo (máx. 60 caracteres).');

  const slug = trimmed
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (!slug) throw new Error('Motivo inválido.');
  const key = `nq_${slug}`;

  const exists = await db.whatsAppCloseReason.findUnique({ where: { key } });
  if (exists) throw new Error('Já existe um motivo igual a esse.');

  const max = await db.whatsAppCloseReason.aggregate({ _max: { sortOrder: true } });
  await db.whatsAppCloseReason.create({
    data: { key, label: `Não qualificada — ${trimmed}`, sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
  return listCloseReasons();
}

export async function deleteCloseReason(id: string): Promise<CloseReasonDTO[]> {
  await requireTeamMember();
  await db.whatsAppCloseReason.delete({ where: { id } }).catch(() => { });
  return listCloseReasons();
}

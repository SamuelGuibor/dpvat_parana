'use server';

import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { db } from '@/app/_shared/lib/prisma';

// Respostas rápidas (snippets) do atendimento de WhatsApp: textos curtos
// reutilizáveis que o atendente insere no composer com um clique. CRUD no
// mesmo espírito das tags (compartilhadas pela equipe toda).

const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++'];

async function requireTeamMember(): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!user || !TEAM_ROLES.includes(user.role)) {
    throw new Error('Sem permissão para o atendimento de WhatsApp.');
  }
}

export interface WhatsAppQuickReplyDTO {
  id: string;
  title: string;
  body: string;
}

export async function listWhatsAppQuickReplies(): Promise<WhatsAppQuickReplyDTO[]> {
  await requireTeamMember();
  const rows = await db.whatsAppQuickReply.findMany({ orderBy: { title: 'asc' } });
  return rows.map((r) => ({ id: r.id, title: r.title, body: r.body }));
}

export async function createWhatsAppQuickReply(title: string, body: string): Promise<WhatsAppQuickReplyDTO> {
  await requireTeamMember();
  const t = title.trim();
  const b = body.trim();
  if (!t) throw new Error('Dê um nome para a resposta rápida.');
  if (t.length > 60) throw new Error('Nome muito longo (máx. 60).');
  if (!b) throw new Error('Escreva o texto da resposta.');
  if (b.length > 4000) throw new Error('Texto muito longo.');
  const existing = await db.whatsAppQuickReply.findUnique({ where: { title: t } });
  if (existing) throw new Error('Já existe uma resposta rápida com esse nome.');
  const row = await db.whatsAppQuickReply.create({ data: { title: t, body: b } });
  return { id: row.id, title: row.title, body: row.body };
}

export async function updateWhatsAppQuickReply(id: string, title: string, body: string): Promise<void> {
  await requireTeamMember();
  const t = title.trim();
  const b = body.trim();
  if (!t || !b) throw new Error('Nome e texto são obrigatórios.');
  if (t.length > 60) throw new Error('Nome muito longo (máx. 60).');
  if (b.length > 4000) throw new Error('Texto muito longo.');
  const clash = await db.whatsAppQuickReply.findUnique({ where: { title: t } });
  if (clash && clash.id !== id) throw new Error('Já existe uma resposta rápida com esse nome.');
  await db.whatsAppQuickReply.update({ where: { id }, data: { title: t, body: b } });
}

export async function deleteWhatsAppQuickReply(id: string): Promise<void> {
  await requireTeamMember();
  await db.whatsAppQuickReply.delete({ where: { id } });
}

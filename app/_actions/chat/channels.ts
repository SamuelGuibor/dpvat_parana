'use server';

import { db } from '@/app/_shared/lib/prisma';
import { authOptions } from '@/app/_shared/lib/auth';
import { getServerSession } from 'next-auth';

export interface ChannelDTO {
  id: string;
  name: string;
  memberIds: string[];
  createdById: string;
  // "Modo aviso": só o dono pode enviar mensagens; os demais membros só leem.
  announceOnly: boolean;
}

/**
 * Cria um canal restrito. O criador entra automaticamente como membro.
 * `memberIds` são os demais participantes selecionados.
 */
export async function createChannel(input: { name: string; memberIds: string[] }): Promise<ChannelDTO> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');

  const name = input.name.trim();
  if (!name) throw new Error('Dê um nome ao canal.');
  if (name.length > 60) throw new Error('Nome muito longo.');

  // Sempre inclui o criador; remove duplicados e vazios.
  const memberIds = Array.from(new Set([session.user.id, ...input.memberIds])).filter(Boolean);

  const channel = await db.chatChannel.create({
    data: {
      name,
      createdById: session.user.id,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
    include: { members: { select: { userId: true } } },
  });

  return {
    id: channel.id,
    name: channel.name,
    memberIds: channel.members.map((m) => m.userId),
    createdById: channel.createdById,
    announceOnly: channel.announceOnly,
  };
}

/** Canais restritos em que o usuário logado é membro. */
export async function listMyChannels(): Promise<ChannelDTO[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');

  const channels = await db.chatChannel.findMany({
    where: { members: { some: { userId: session.user.id } } },
    orderBy: { createdAt: 'asc' },
    include: { members: { select: { userId: true } } },
  });

  return channels.map((c) => ({
    id: c.id,
    name: c.name,
    memberIds: c.members.map((m) => m.userId),
    createdById: c.createdById,
    announceOnly: c.announceOnly,
  }));
}

async function assertOwner(channelId: string, userId: string) {
  const channel = await db.chatChannel.findUnique({ where: { id: channelId }, select: { createdById: true } });
  if (!channel) throw new Error('Canal não encontrado.');
  if (channel.createdById !== userId) throw new Error('Só o dono do canal pode fazer isso.');
}

/** Renomeia o canal. Restrito ao dono (createdById). */
export async function renameChannel({ channelId, name }: { channelId: string; name: string }): Promise<ChannelDTO> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');

  const trimmed = name.trim();
  if (!trimmed) throw new Error('Dê um nome ao canal.');
  if (trimmed.length > 60) throw new Error('Nome muito longo.');

  await assertOwner(channelId, session.user.id);

  const updated = await db.chatChannel.update({
    where: { id: channelId },
    data: { name: trimmed },
    include: { members: { select: { userId: true } } },
  });

  return {
    id: updated.id,
    name: updated.name,
    memberIds: updated.members.map((m) => m.userId),
    createdById: updated.createdById,
    announceOnly: updated.announceOnly,
  };
}

/**
 * Liga/desliga o modo "aviso" (só o dono envia mensagens). Restrito ao dono.
 */
export async function setAnnounceOnly({ channelId, announceOnly }: { channelId: string; announceOnly: boolean }): Promise<ChannelDTO> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');

  await assertOwner(channelId, session.user.id);

  const updated = await db.chatChannel.update({
    where: { id: channelId },
    data: { announceOnly },
    include: { members: { select: { userId: true } } },
  });

  return {
    id: updated.id,
    name: updated.name,
    memberIds: updated.members.map((m) => m.userId),
    createdById: updated.createdById,
    announceOnly: updated.announceOnly,
  };
}

/**
 * Exclui o canal. Restrito ao dono. `ChatMessage`/`ChatRead` não têm FK para
 * `ChatChannel` (só guardam channelId solto), então precisam ser limpos à mão;
 * `ChatChannelMember` já cai em cascata via FK ao apagar o `ChatChannel`.
 */
export async function deleteChannel({ channelId }: { channelId: string }): Promise<{ ok: true }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Usuário não autenticado.');

  await assertOwner(channelId, session.user.id);

  await db.$transaction([
    db.chatMessage.deleteMany({ where: { channelId } }),
    db.chatRead.deleteMany({ where: { channelId } }),
    db.chatChannel.delete({ where: { id: channelId } }),
  ]);

  return { ok: true };
}

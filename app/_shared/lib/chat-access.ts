import { db } from './prisma';
import { GENERAL_CHANNEL, dmParticipants } from '@/app/_shared/utils/chat';

// Roles que compõem a "equipe" (mesma convenção de /api/presence e /api/admins).
const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++'];

/**
 * Acesso a um canal (server-side, com consulta ao banco para canais custom):
 *  - "general": público a toda a equipe.
 *  - "dm:*": só os dois participantes.
 *  - custom (id do ChatChannel): só membros (ChatChannelMember).
 */
export async function canAccessChannel(channelId: string, userId: string): Promise<boolean> {
  if (channelId === GENERAL_CHANNEL) return true;

  const parts = dmParticipants(channelId);
  if (parts) return parts.includes(userId);

  const member = await db.chatChannelMember.findUnique({
    where: { channelId_userId: { channelId, userId } },
    select: { userId: true },
  });
  return !!member;
}

/** Destinatários do broadcast em tempo real para um canal. */
export async function channelRecipients(channelId: string, fallbackUserId: string): Promise<string[]> {
  if (channelId === GENERAL_CHANNEL) {
    const admins = await db.user.findMany({ where: { role: { in: TEAM_ROLES } }, select: { id: true } });
    return admins.map((a) => a.id);
  }

  const parts = dmParticipants(channelId);
  if (parts) return parts;

  const members = await db.chatChannelMember.findMany({ where: { channelId }, select: { userId: true } });
  return members.length ? members.map((m) => m.userId) : [fallbackUserId];
}

/** Ids de todos os canais que o usuário participa (general + DMs + custom). */
export async function userChannelIds(userId: string): Promise<string[]> {
  const [dmRows, customRows] = await Promise.all([
    db.chatMessage.findMany({
      where: { channelId: { startsWith: 'dm:', contains: userId } },
      distinct: ['channelId'],
      select: { channelId: true },
    }),
    db.chatChannelMember.findMany({ where: { userId }, select: { channelId: true } }),
  ]);

  return [
    GENERAL_CHANNEL,
    ...dmRows.map((r) => r.channelId),
    ...customRows.map((r) => r.channelId),
  ];
}

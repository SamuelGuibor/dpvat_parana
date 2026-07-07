import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { db } from '@/app/_shared/lib/prisma';
import { authOptions } from '@/app/_shared/lib/auth';
import { canAccessChannel, userChannelIds } from '@/app/_shared/lib/chat-access';

// GET /api/chat/read -> { unread: { [channelId]: number } }
// Conta mensagens de OUTROS autores criadas depois do lastReadAt do usuário,
// em todos os canais que ele participa (general + DMs + canais custom).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  const userId = session.user.id;

  const [reads, channelIds] = await Promise.all([
    db.chatRead.findMany({ where: { userId } }),
    userChannelIds(userId),
  ]);

  const readMap = new Map(reads.map((r) => [r.channelId, r.lastReadAt]));
  const unread: Record<string, number> = {};

  await Promise.all(
    channelIds.map(async (channelId) => {
      const lastReadAt = readMap.get(channelId);
      const count = await db.chatMessage.count({
        where: {
          channelId,
          authorId: { not: userId },
          ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}),
        },
      });
      if (count > 0) unread[channelId] = count;
    }),
  );

  return NextResponse.json({ unread });
}

// POST /api/chat/read { channelId } -> marca o canal como lido agora.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  const userId = session.user.id;

  const { channelId } = await req.json().catch(() => ({}));
  if (!channelId || !(await canAccessChannel(channelId, userId))) {
    return NextResponse.json({ error: 'Canal inválido' }, { status: 400 });
  }

  await db.chatRead.upsert({
    where: { userId_channelId: { userId, channelId } },
    create: { userId, channelId, lastReadAt: new Date() },
    update: { lastReadAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

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
  if (channelIds.length === 0) return NextResponse.json({ unread });

  // Uma query agregada pra todos os canais (era um count() por canal, a cada
  // 20s por aba aberta).
  const groups = await db.chatMessage.groupBy({
    by: ['channelId'],
    where: {
      authorId: { not: userId },
      OR: channelIds.map((channelId) => {
        const lastReadAt = readMap.get(channelId);
        return { channelId, ...(lastReadAt ? { createdAt: { gt: lastReadAt } } : {}) };
      }),
    },
    _count: { _all: true },
  });
  for (const g of groups) {
    if (g._count._all > 0) unread[g.channelId] = g._count._all;
  }

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

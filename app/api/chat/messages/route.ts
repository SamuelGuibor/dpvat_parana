import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { db } from '@/app/_shared/lib/prisma';
import { authOptions } from '@/app/_shared/lib/auth';
import { canAccessChannel } from '@/app/_shared/lib/chat-access';

// Histórico de um canal (também usado pelo polling de fallback do SWR).
// GET /api/chat/messages?channelId=general&after=<ISO>&limit=50
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get('channelId');
  if (!channelId) {
    return NextResponse.json({ error: 'channelId obrigatório' }, { status: 400 });
  }
  if (!(await canAccessChannel(channelId, session.user.id))) {
    return NextResponse.json({ error: 'Sem acesso a este canal' }, { status: 403 });
  }

  const after = searchParams.get('after');
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);

  const rows = await db.chatMessage.findMany({
    where: {
      channelId,
      ...(after ? { createdAt: { gt: new Date(after) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, body: true, authorId: true, authorName: true,
      channelId: true, createdAt: true, editedAt: true, deletedAt: true,
      replyToId: true, replyToAuthor: true, replyToBody: true,
      attachmentKey: true, attachmentName: true, attachmentType: true,
      reactions: { select: { emoji: true, userId: true, userName: true }, orderBy: { createdAt: 'asc' } },
    },
  });

  // Devolve em ordem cronológica (mais antigo primeiro) para render direto.
  const messages = rows
    .reverse()
    .map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt?.toISOString() ?? null,
    }));

  return NextResponse.json({ messages });
}

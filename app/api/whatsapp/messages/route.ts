import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { db } from '@/app/_shared/lib/prisma';
import { authOptions } from '@/app/_shared/lib/auth';

// Histórico de uma conversa de WhatsApp (também é o polling de fallback do SWR,
// espelho de /api/chat/messages).
// GET /api/whatsapp/messages?contactId=<id>&after=<ISO>&before=<ISO>&limit=50
//   - after:  mensagens MAIS NOVAS que o ISO (polling incremental)
//   - before: mensagens MAIS ANTIGAS que o ISO (paginação "carregar anteriores")

const TEAM_ROLES = ['ADMIN', 'ADMIN+', 'ADMIN++'];

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  if (!me || !TEAM_ROLES.includes(me.role)) {
    return NextResponse.json({ error: 'Sem acesso' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const contactId = searchParams.get('contactId');
  if (!contactId) {
    return NextResponse.json({ error: 'contactId obrigatório' }, { status: 400 });
  }

  const after = searchParams.get('after');
  const before = searchParams.get('before');
  const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);

  const rows = await db.whatsAppMessage.findMany({
    where: {
      contactId,
      ...(after ? { createdAt: { gt: new Date(after) } } : {}),
      ...(before ? { createdAt: { lt: new Date(before) } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true, contactId: true, direction: true, body: true,
      mediaKey: true, mediaType: true, status: true, sentByBot: true,
      authorId: true, internal: true, createdAt: true,
      editedAt: true, deletedAt: true,
      replyToId: true, replyToBody: true, replyToDirection: true,
    },
  });

  // Nome dos atendentes que aparecem na thread (mensagens "out" humanas).
  const authorIds = [...new Set(rows.map((r) => r.authorId).filter(Boolean))] as string[];
  const authors = authorIds.length
    ? await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(authors.map((a) => [a.id, a.name ?? 'Atendente']));

  const messages = rows
    .reverse()
    .map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
      editedAt: m.editedAt?.toISOString() ?? null,
      deletedAt: m.deletedAt?.toISOString() ?? null,
      authorName: m.authorId ? nameById.get(m.authorId) ?? null : m.sentByBot ? 'Bot' : null,
    }));

  // hasMore: veio o bloco cheio → provavelmente há mais mensagens antigas.
  return NextResponse.json({ messages, hasMore: rows.length === limit });
}

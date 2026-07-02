import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { db } from '@/app/_lib/prisma';
import { authOptions } from '@/app/_lib/auth';

// Considera "online" quem enviou heartbeat nos últimos 90s.
// O client bate a cada 30s, então há folga para 2 batidas perdidas.
const ONLINE_WINDOW_MS = 90_000;

async function buildList(currentUserId?: string) {
  // A "equipe" é exatamente quem tem role ADMIN — os mesmos que têm acesso
  // à dashboard (ver a checagem em nova-dash/page.tsx).
  const admins = await db.user.findMany({
    where: { role: 'ADMIN' },
    select: { id: true, name: true, image: true, role: true, lastSeenAt: true },
  });

  const now = Date.now();

  return admins
    .filter((a) => a.name && a.name.trim().length > 0)
    .map((a) => {
      const online =
        !!a.lastSeenAt && now - new Date(a.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
      return {
        id: a.id,
        name: a.name as string,
        image: a.image ?? null,
        role: a.role,
        online,
        isMe: a.id === currentUserId,
        lastSeenAt: a.lastSeenAt ? a.lastSeenAt.toISOString() : null,
      };
    })
    // Online primeiro; dentro de cada grupo, ordem alfabética.
    .sort((x, y) => {
      if (x.online !== y.online) return x.online ? -1 : 1;
      return x.name.localeCompare(y.name, 'pt-BR');
    });
}

// Heartbeat: marca o usuário atual como visto agora e devolve a lista atualizada.
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  await db.user
    .update({ where: { id: session.user.id }, data: { lastSeenAt: new Date() } })
    .catch((err) => console.error('[PRESENCE] Falha no heartbeat:', err));

  const members = await buildList(session.user.id);
  return NextResponse.json({ members });
}

// Apenas leitura da lista (sem marcar presença).
export async function GET() {
  const session = await getServerSession(authOptions);
  const members = await buildList(session?.user?.id);
  return NextResponse.json({ members });
}

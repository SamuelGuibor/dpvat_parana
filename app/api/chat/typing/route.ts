import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { broadcastToRelay, isRelayConfigured } from '@/app/_shared/lib/chat-relay';
import { canAccessChannel, channelRecipients } from '@/app/_shared/lib/chat-access';

// POST /api/chat/typing { channelId }
// Avisa (via relay SSE) que o usuário está digitando naquele canal. Efêmero:
// não persiste nada. Se o relay não estiver ligado, é um no-op (o indicador
// simplesmente não aparece — não há fallback por polling para "digitando").
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }
  if (!isRelayConfigured()) return NextResponse.json({ ok: true, relay: false });

  const { channelId } = await req.json().catch(() => ({}));
  if (!channelId || !(await canAccessChannel(channelId, session.user.id))) {
    return NextResponse.json({ error: 'Canal inválido' }, { status: 400 });
  }

  const recipients = (await channelRecipients(channelId, session.user.id))
    .filter((id) => id !== session.user!.id); // não avisa a si mesmo

  await broadcastToRelay({
    channelId,
    recipients,
    message: {
      type: 'typing',
      channelId,
      userId: session.user.id,
      userName: session.user.name ?? 'Alguém',
    },
  });

  return NextResponse.json({ ok: true });
}

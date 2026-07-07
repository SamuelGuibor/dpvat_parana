import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { isRelayConfigured, signRelayToken } from '@/app/_shared/lib/chat-relay';

// GET /api/chat/token -> { url, token } para o cliente abrir o EventSource,
// ou { url: null } quando o relay não está configurado (chat cai no polling).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  if (!isRelayConfigured()) {
    return NextResponse.json({ url: null });
  }

  return NextResponse.json({
    url: process.env.CHAT_RELAY_URL?.replace(/\/$/, '') ?? null,
    token: signRelayToken(session.user.id),
  });
}

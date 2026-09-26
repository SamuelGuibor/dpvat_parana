import { NextRequest } from 'next/server';
import { noStoreJson, teamRoute } from '@/app/_shared/lib/route-auth';
import { searchConversations } from '@/app/_shared/lib/whatsapp/inbox-data';
import type { InboxSearchResponse } from '@/app/_shared/lib/whatsapp/inbox-types';
import { ROUTE_FAILURE_MESSAGE } from '@/app/_shared/utils/route-guards';

// Busca do inbox em TODO o histórico (nome do contato, nome do card vinculado
// e telefone), por GET: cada tecla (com debounce de 350 ms no cliente) deixava
// de ser mais uma server action na fila serial da aba.
// GET /api/whatsapp/inbox/search?q=<termo> → { items } (até SEARCH_PAGE).
// Menos de 2 caracteres → { items: [] }.
//
// Acesso: `teamRoute` (cargo do banco + trava de IP); não entra em allowlist.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await teamRoute();
  if ('res' in auth) return auth.res;

  const q = req.nextUrl.searchParams.get('q') ?? '';
  try {
    const body: InboxSearchResponse = { items: await searchConversations(q) };
    return noStoreJson(body);
  } catch (err) {
    console.error('[WA inbox] falha na busca:', err);
    return noStoreJson({ error: ROUTE_FAILURE_MESSAGE }, { status: 500 });
  }
}

import { NextRequest } from 'next/server';
import { noStoreJson, teamRoute } from '@/app/_shared/lib/route-auth';
import { loadConversationByContact, loadConversationList } from '@/app/_shared/lib/whatsapp/inbox-data';
import type { InboxItemResponse, InboxListResponse } from '@/app/_shared/lib/whatsapp/inbox-types';
import { ROUTE_FAILURE_MESSAGE } from '@/app/_shared/utils/route-guards';

// Lista do inbox do WhatsApp por GET, fora da fila serial de server actions
// (o clique do atendente não espera mais a recarga de 1.000 conversas).
// GET /api/whatsapp/inbox/conversations            → { items, cursor } (LIST_PAGE mais recentes)
// GET /api/whatsapp/inbox/conversations?contactId= → { item } (UMA conversa; null se não houver)
// `?since=` fica reservado para a sincronização por delta; hoje é ignorado.
//
// Acesso: `teamRoute` (cargo do banco + trava de IP). Rota da equipe: NÃO
// entra em allowlist do middleware. A resposta traz nome e telefone de
// cliente: `noStoreJson` (private, no-store). ~1,3 MB cru (~165 KB gzip),
// abaixo do teto de 4,5 MB da função.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await teamRoute();
  if ('res' in auth) return auth.res;

  const contactId = req.nextUrl.searchParams.get('contactId');
  try {
    if (contactId !== null) {
      if (!contactId.trim()) return noStoreJson({ error: 'contactId vazio.' }, { status: 400 });
      const body: InboxItemResponse = { item: await loadConversationByContact(contactId) };
      return noStoreJson(body);
    }
    const body: InboxListResponse = { items: await loadConversationList(), cursor: null };
    return noStoreJson(body);
  } catch (err) {
    // Texto próprio em vez do 500 vazio do Next: a lista mostra o aviso e
    // mantém o que já tinha (jsonFetcher + SWR).
    console.error('[WA inbox] falha ao carregar a lista:', err);
    return noStoreJson({ error: ROUTE_FAILURE_MESSAGE }, { status: 500 });
  }
}

import { NextRequest } from 'next/server';
import { noStoreJson, teamRoute } from '@/app/_shared/lib/route-auth';
import {
  loadConversationByContact, loadConversationsSince, loadInboxList,
} from '@/app/_shared/lib/whatsapp/inbox-data';
import type {
  InboxDeltaResponse, InboxItemResponse, InboxListResponse,
} from '@/app/_shared/lib/whatsapp/inbox-types';
import { parseDeltaSince } from '@/app/_shared/utils/inbox-delta';
import { ROUTE_FAILURE_MESSAGE } from '@/app/_shared/utils/route-guards';

// Lista do inbox do WhatsApp por GET, fora da fila serial de server actions
// (o clique do atendente não espera mais a recarga de 1.000 conversas).
// GET /api/whatsapp/inbox/conversations            → { items, cursor, total } (LIST_PAGE mais recentes)
// GET /api/whatsapp/inbox/conversations?since=ISO  → { items, cursor, full, total } (só o que mudou)
// GET /api/whatsapp/inbox/conversations?contactId= → { item } (UMA conversa; null se não houver)
//
// `?since=` é o poll de 15 s do inbox (sincronização por delta, auditoria de
// 24/09/2026): quase sempre `items: []`. since ausente do formato, com mais de
// 24 h ou no futuro → `full: true` sem ir ao banco, e o cliente busca a lista
// inteira. `cursor` = now() do banco, devolvido no próximo `since`.
//
// Acesso: `teamRoute` (cargo do banco + trava de IP). Rota da equipe: NÃO
// entra em allowlist do middleware. A resposta traz nome e telefone de
// cliente: `noStoreJson` (private, no-store). A lista completa tem ~1,3 MB cru
// (~165 KB gzip), abaixo do teto de 4,5 MB da função.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await teamRoute();
  if ('res' in auth) return auth.res;

  const params = req.nextUrl.searchParams;
  const contactId = params.get('contactId');
  const sinceRaw = params.get('since');
  try {
    if (contactId !== null) {
      if (!contactId.trim()) return noStoreJson({ error: 'contactId vazio.' }, { status: 400 });
      const body: InboxItemResponse = { item: await loadConversationByContact(contactId) };
      return noStoreJson(body);
    }
    if (sinceRaw !== null) {
      const since = parseDeltaSince(sinceRaw, Date.now());
      const body: InboxDeltaResponse = since
        ? await loadConversationsSince(since)
        : { items: [], cursor: null, full: true, total: null };
      return noStoreJson(body);
    }
    const body: InboxListResponse = await loadInboxList();
    return noStoreJson(body);
  } catch (err) {
    // Texto próprio em vez do 500 vazio do Next: a lista mostra o aviso e
    // mantém o que já tinha (jsonFetcher + SWR).
    console.error('[WA inbox] falha ao carregar a lista:', err);
    return noStoreJson({ error: ROUTE_FAILURE_MESSAGE }, { status: 500 });
  }
}

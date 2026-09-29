import { NextRequest } from 'next/server';
import { noStoreJson, teamRoute } from '@/app/_shared/lib/route-auth';
import { queryConversations } from '@/app/_shared/lib/whatsapp/inbox-data';
import type { InboxSearchResponse } from '@/app/_shared/lib/whatsapp/inbox-types';
import { parseInboxFilterParams } from '@/app/_shared/utils/inbox-filter';
import { ROUTE_FAILURE_MESSAGE } from '@/app/_shared/utils/route-guards';

// Busca e filtros do inbox em TODO o histórico, por GET: cada tecla (com
// debounce de 350 ms no cliente) e cada troca de filtro deixavam de ser mais
// uma server action na fila serial da aba.
//
// GET /api/whatsapp/inbox/search
//   ?q=<termo>            nome do contato, nome do card vinculado ou telefone (2+ caracteres)
//   &tag=<id>&tag=<id>    basta uma das tags
//   &from=&to=YYYY-MM-DD  data de entrada (dias de Brasília, inclusivos)
//   &label=<labelId>      coluna do Kanban (cards não arquivados)
//   &number=<numberId>    linha da empresa (só junto de um filtro acima)
//   &fila=1               só quem está na Fila (só junto de um filtro acima)
//   &skip=<n>             página seguinte ("Carregar mais")
// → { items, total }: uma página (SEARCH_PAGE) e quantas casam no banco. Sem
// busca/tag/data/coluna → { items: [], total: 0 }. O bundle anterior só manda
// `?q=` e lê `items`: continua igual.
//
// Acesso: `teamRoute` (cargo do banco + trava de IP); não entra em allowlist.

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = await teamRoute();
  if ('res' in auth) return auth.res;

  const filter = parseInboxFilterParams(req.nextUrl.searchParams);
  try {
    const body: InboxSearchResponse = await queryConversations(filter);
    return noStoreJson(body);
  } catch (err) {
    console.error('[WA inbox] falha na busca/filtro:', err);
    return noStoreJson({ error: ROUTE_FAILURE_MESSAGE }, { status: 500 });
  }
}

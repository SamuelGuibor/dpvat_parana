import { noStoreJson, teamRoute } from '@/app/_shared/lib/route-auth';
import { loadInboxColumns } from '@/app/_shared/lib/whatsapp/inbox-data';
import type { InboxColumnsResponse } from '@/app/_shared/lib/whatsapp/inbox-types';
import { ROUTE_FAILURE_MESSAGE } from '@/app/_shared/utils/route-guards';

// Opções do filtro "Coluna do Kanban" do inbox: as colunas do quadro, na
// ordem dele, com quantas conversas têm card NÃO arquivado em cada uma
// (~4 ms). Por GET e não pela action getLabels: ela entraria na fila serial de
// server actions da aba na frente do 1º clique e não tem guarda nenhuma.
//
// GET /api/whatsapp/inbox/columns → { items: [{ id, name, count }] }
//
// Acesso: `teamRoute` (cargo do banco + trava de IP); não entra em allowlist.

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await teamRoute();
  if ('res' in auth) return auth.res;

  try {
    const body: InboxColumnsResponse = await loadInboxColumns();
    return noStoreJson(body);
  } catch (err) {
    console.error('[WA inbox] falha ao listar as colunas do Kanban:', err);
    return noStoreJson({ error: ROUTE_FAILURE_MESSAGE }, { status: 500 });
  }
}

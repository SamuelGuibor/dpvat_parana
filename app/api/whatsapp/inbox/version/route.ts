import { noStoreJson, teamRoute } from '@/app/_shared/lib/route-auth';
import { getInboxVersion } from '@/app/_shared/lib/whatsapp/inbox-data';
import type { InboxVersionResponse } from '@/app/_shared/lib/whatsapp/inbox-types';
import { ROUTE_FAILURE_MESSAGE } from '@/app/_shared/utils/route-guards';

// Hash do que a lista do inbox exibe + total real de conversas, numa query só
// (~4 ms). TRANSITÓRIA: o inbox atual sincroniza por delta
// (/api/whatsapp/inbox/conversations?since=, que também traz o total). Esta
// rota fica só para as abas com o bundle anterior, que ainda fazem o poll de
// 15 s do hash; remover quando o delta estabilizar.
//
// Acesso: `teamRoute` (cargo do banco + trava de IP); não entra em allowlist.

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await teamRoute();
  if ('res' in auth) return auth.res;

  try {
    const body: InboxVersionResponse = await getInboxVersion();
    return noStoreJson(body);
  } catch (err) {
    console.error('[WA inbox] falha ao calcular a versão:', err);
    return noStoreJson({ error: ROUTE_FAILURE_MESSAGE }, { status: 500 });
  }
}

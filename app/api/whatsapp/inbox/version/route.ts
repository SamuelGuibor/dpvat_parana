import { noStoreJson, teamRoute } from '@/app/_shared/lib/route-auth';
import { getInboxVersion } from '@/app/_shared/lib/whatsapp/inbox-data';
import type { InboxVersionResponse } from '@/app/_shared/lib/whatsapp/inbox-types';
import { ROUTE_FAILURE_MESSAGE } from '@/app/_shared/utils/route-guards';

// Hash do que a lista do inbox exibe + total real de conversas, numa query só
// (~4 ms). É o poll de 15 s de toda aba com o inbox aberto (e o do foco): a
// lista pesada só desce quando `version` muda. GET fora da fila serial de
// server actions — o poll não segura mais o clique do atendente.
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

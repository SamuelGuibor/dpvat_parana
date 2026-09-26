import { noStoreJson, teamRoute } from '@/app/_shared/lib/route-auth';
import { loadHeaderBadges } from '@/app/_shared/lib/header-badges';
import type { HeaderBadgesResponse } from '@/app/_shared/lib/header-badges-types';
import { ROUTE_FAILURE_MESSAGE } from '@/app/_shared/utils/route-guards';

// Avisos do cabeçalho da nova-dash numa ida só:
// GET /api/team/badges → { whatsappUnread, mentionsPending, devAlerts, eventsSoon }
//
// Substitui 4 server actions com polls próprios (countWhatsAppUnread,
// countPendingMentions, getActiveDevAlerts e countEventsSoon): as actions de
// uma aba saem numa fila SERIAL, e voltar o foco enfileirava as contagens na
// frente do clique do atendente. Por GET correm fora dessa fila, e as 4
// consultas vão em paralelo no banco (~ms cada).
//
// Acesso: `teamRoute` (cargo do banco + trava de IP). Rota da equipe: NÃO
// entra em allowlist do middleware (sem sessão = 401 lá; cliente logado por
// CPF = 403 aqui). As menções são de quem está logado (ctx.userId do banco,
// nunca um id vindo do navegador).

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await teamRoute();
  if ('res' in auth) return auth.res;

  try {
    const body: HeaderBadgesResponse = await loadHeaderBadges(auth.ctx.userId);
    return noStoreJson(body);
  } catch (err) {
    // Texto próprio em vez do 500 vazio do Next: o SWR mantém os últimos
    // números na tela e tenta de novo.
    console.error('[badges] falha ao contar os avisos do cabeçalho:', err);
    return noStoreJson({ error: ROUTE_FAILURE_MESSAGE }, { status: 500 });
  }
}

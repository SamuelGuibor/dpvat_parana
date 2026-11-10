import { noStoreJson, teamRoute } from '@/app/_shared/lib/route-auth';
import { loadUnreadByCard } from '@/app/_shared/lib/whatsapp/card-unread';
import { ROUTE_FAILURE_MESSAGE } from '@/app/_shared/utils/route-guards';

// Selo "cliente mandou mensagem" nos cards do Kanban (T-AJ2PT):
// GET /api/kanban/unread → { users: { [id]: { contactId, at } }, processes: {…} }
//
// Fora do /api/board-state de propósito: o hash de versão do board é
// consultado a cada 7 s por aba e teria de varrer whatsapp_messages; aqui o
// poll é de 30 s (como o badge de não lidas do topo) e só para quem vê o
// WhatsApp. Rota da equipe: NÃO entra em allowlist do middleware.

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await teamRoute('view_whatsapp');
  if ('res' in auth) return auth.res;
  try {
    return noStoreJson(await loadUnreadByCard());
  } catch (err) {
    console.error('[kanban-unread] falha ao listar conversas não lidas por card:', err);
    return noStoreJson({ error: ROUTE_FAILURE_MESSAGE }, { status: 500 });
  }
}

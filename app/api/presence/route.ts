import { db } from '@/app/_shared/lib/prisma';
import { noStoreJson, teamRoute } from '@/app/_shared/lib/route-auth';
import { TEAM_ROLES } from '@/app/_shared/lib/permissions';

// Considera "online" quem enviou heartbeat nos últimos 5 min.
// O client bate a cada 2 min, então há folga para 2 batidas perdidas.
const ONLINE_WINDOW_MS = 300_000;

// Sem GET, de propósito: o GET antigo devolvia nome, foto, cargo e último
// acesso da equipe a QUALQUER sessão (cliente logado por CPF incluso) e não
// tinha consumidor no app — a lista só sai do heartbeat abaixo, para a equipe.

export const dynamic = 'force-dynamic';

async function buildList(currentUserId: string) {
  // A "equipe" é quem tem role ADMIN* — os mesmos que têm acesso
  // à dashboard (ver a checagem em nova-dash/page.tsx).
  const admins = await db.user.findMany({
    where: { role: { in: [...TEAM_ROLES] } },
    select: { id: true, name: true, image: true, role: true, lastSeenAt: true },
  });

  const now = Date.now();

  return admins
    .filter((a) => a.name && a.name.trim().length > 0)
    .map((a) => {
      const online =
        !!a.lastSeenAt && now - new Date(a.lastSeenAt).getTime() < ONLINE_WINDOW_MS;
      return {
        id: a.id,
        name: a.name as string,
        image: a.image ?? null,
        role: a.role,
        online,
        isMe: a.id === currentUserId,
        lastSeenAt: a.lastSeenAt ? a.lastSeenAt.toISOString() : null,
      };
    })
    // Online primeiro; dentro de cada grupo, ordem alfabética.
    .sort((x, y) => {
      if (x.online !== y.online) return x.online ? -1 : 1;
      return x.name.localeCompare(y.name, 'pt-BR');
    });
}

// Heartbeat: marca o usuário atual como visto agora e devolve a lista atualizada.
// Só equipe (cargo do banco + trava de IP): o middleware aceita qualquer sessão.
export async function POST() {
  const auth = await teamRoute();
  if ('res' in auth) return auth.res;
  const { ctx } = auth;

  // updateMany (e não update): o update devolve a linha inteira do User — com
  // o hash da senha — só para ser descartada. Aqui volta só a contagem.
  await db.user
    .updateMany({ where: { id: ctx.userId }, data: { lastSeenAt: new Date() } })
    .catch((err) => console.error('[PRESENCE] Falha no heartbeat:', err));

  try {
    const members = await buildList(ctx.userId);
    return noStoreJson({ members });
  } catch (err) {
    console.error('[PRESENCE] Falha ao montar a lista:', err);
    return noStoreJson({ error: 'Falha ao carregar a presença.' }, { status: 500 });
  }
}

import { db } from '@/app/_shared/lib/prisma';
import { countUnreadConversations } from '@/app/_shared/lib/whatsapp/inbox-data';
import type { DevAlertDTO, HeaderBadgesResponse } from './header-badges-types';

// Contagens do cabeçalho da nova-dash: não lidas do WhatsApp, menções
// pendentes, pop-ups do dev e eventos próximos.
//
// Sem "use server" e SEM guarda de acesso: quem chama já passou pela guarda —
// a rota GET /api/team/badges (`teamRoute`: cargo do banco + trava de IP) e as
// actions antigas mantidas por um deploy (countPendingMentions,
// getActiveDevAlerts, countEventsSoon, countWhatsAppUnread). Nunca exponha
// estas funções numa rota ou action sem guarda.
//
// Por que existe (auditoria de 24/09/2026): eram 4 server actions com polls
// próprios (30 s, 30 s, 30 s e 5 min), e as actions de uma aba saem numa fila
// SERIAL — voltar o foco à aba enfileirava as contagens na frente do clique do
// atendente. Agora é uma ida só a cada 30 s, por GET, com as 4 consultas em
// paralelo no banco.

/** Janela do contador de eventos: começou há até 3 h ou começa nas próximas 24 h. */
const EVENTS_SOON_PAST_MS = 3 * 60 * 60 * 1000;
const EVENTS_SOON_AHEAD_MS = 24 * 60 * 60 * 1000;
/** Quantos pop-ups do dev descem por vez (os mais antigos primeiro). */
const DEV_ALERTS_TAKE = 10;

/** Menções PENDENTES do destinatário (badge da aba Menções e Tarefas). */
export function countPendingMentionsFor(recipientId: string): Promise<number> {
  return db.mention.count({ where: { recipientId, status: 'PENDING' } });
}

/** Pop-ups do dev ainda válidos (cada um vale 2 h desde a criação). */
export async function loadActiveDevAlerts(): Promise<DevAlertDTO[]> {
  const alerts = await db.devAlert.findMany({
    where: { expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'asc' },
    take: DEV_ALERTS_TAKE,
    select: { id: true, title: true, message: true, authorName: true, createdAt: true },
  });
  return alerts.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }));
}

/**
 * Eventos que começam nas próximas 24 h (incluindo os que começaram há até
 * 3 h). Janela RELATIVA em milissegundos, sem corte de dia — por isso não
 * passa pelo date-br.
 */
export function countUpcomingEvents(now: number = Date.now()): Promise<number> {
  return db.event.count({
    where: {
      startsAt: {
        gte: new Date(now - EVENTS_SOON_PAST_MS),
        lte: new Date(now + EVENTS_SOON_AHEAD_MS),
      },
    },
  });
}

/** Tudo o que o cabeçalho conta para `userId`, com as 4 consultas em paralelo. */
export async function loadHeaderBadges(userId: string): Promise<HeaderBadgesResponse> {
  const [whatsappUnread, mentionsPending, devAlerts, eventsSoon] = await Promise.all([
    countUnreadConversations(),
    countPendingMentionsFor(userId),
    loadActiveDevAlerts(),
    countUpcomingEvents(),
  ]);
  return { whatsappUnread, mentionsPending, devAlerts, eventsSoon };
}

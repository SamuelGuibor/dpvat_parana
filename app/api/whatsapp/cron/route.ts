import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/_shared/lib/prisma';
import { sendBotReply } from '@/app/_shared/lib/whatsapp/bot';
import { whatsappRecipients, alertDeliveryFailure } from '@/app/_shared/lib/whatsapp/service';

// Detector de silêncio do bot (rodado por cron externo, a cada 15min):
//
// 1. Cliente sumiu há 30min+ → "Você precisa de mais alguma coisa? 😊"
//    Se ele responder, o atendimento segue normalmente (o marcador
//    botNudge30At é zerado pelo service.ts quando chega mensagem).
// 2. Cliente segue sem responder 10min+ depois do aviso → despedida (gerada
//    pela IA com base na conversa; texto fixo como fallback) e encerra o
//    ticket, ZERANDO a memória/estado do bot (qualificado ou não). Os dados
//    de cadastro do cliente (nome, CPF etc.) continuam na ficha do kanban.
// 3. SLA da fila de espera: cliente em "queued" há 10min+ sem atendente →
//    re-notifica a equipe (Notification + Discord); repete a cada 1h.
//
// Auth: o Vercel Cron manda "Authorization: Bearer ${CRON_SECRET}" quando a
// env CRON_SECRET existe; também aceita ?secret= pra disparo manual/externo.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NUDGE_30MIN = 'Você precisa de mais alguma coisa?';
const FAREWELL =
  'Como não tivemos retorno, vou encerrar nosso atendimento por aqui, tá bom? Qualquer coisa é só mandar uma mensagem que a gente continua.';

const NUDGE_AFTER_MS = 30 * 60_000; // 30min sem resposta → pergunta
const CLOSE_AFTER_MS = 10 * 60_000; // +10min sem resposta → encerra
const QUEUE_SLA_MS = 10 * 60_000;   // 10min na fila sem atendente → alerta
const QUEUE_REALERT_MS = 60 * 60_000; // repete o alerta a cada 1h
// Mensagem "sent" que nunca virou "delivered": quando um número BLOQUEIA a
// empresa a Meta nem manda status "failed" — a mensagem só fica travada no
// tique único. 12h+ nesse estado → alerta de verificação pra equipe.
const STUCK_SENT_MS = 12 * 60 * 60_000;
const STUCK_SENT_LOOKBACK_MS = 72 * 60 * 60_000; // ignora histórico antigo

const CHATBOT_URL = process.env.CHATBOT_URL?.replace(/\/$/, '') ?? '';
const CHATBOT_SECRET = process.env.CHATBOT_SECRET ?? '';

/**
 * Despedida CONTEXTUAL: pede ao microserviço da IA um fecho formal resumindo
 * o que foi conversado. Qualquer falha (endpoint ainda não deployado, timeout,
 * serviço fora) cai no texto fixo — o encerramento nunca fica travado.
 */
async function buildFarewell(contactId: string, contactName: string | null): Promise<string> {
  if (!CHATBOT_URL || !CHATBOT_SECRET) return FAREWELL;
  try {
    const [history, conv] = await Promise.all([
      db.whatsAppMessage.findMany({
        where: { contactId, internal: false, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { direction: true, sentByBot: true, body: true },
      }),
      db.whatsAppConversation.findUnique({ where: { contactId }, select: { botMemory: true } }),
    ]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${CHATBOT_URL}/farewell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bot-secret': CHATBOT_SECRET },
        body: JSON.stringify({
          contact: { name: contactName },
          memory: conv?.botMemory ?? null,
          history: history
            .reverse()
            .filter((h) => h.body)
            .map((h) => ({ role: h.direction === 'in' ? 'client' : h.sentByBot ? 'bot' : 'agent', text: h.body })),
        }),
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`farewell HTTP ${res.status}`);
      const data = await res.json();
      const text = String(data?.farewell ?? '').trim();
      return text || FAREWELL;
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn('[WHATSAPP CRON] Despedida por IA indisponível (usando texto fixo):', err);
    return FAREWELL;
  }
}

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get('authorization');
  if (auth === `Bearer ${secret}`) return true;
  return req.nextUrl.searchParams.get('secret') === secret;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const results = { nudged30: 0, closed: 0, queueAlerts: 0, deliveryAlerts: 0, errors: 0 };

  // ---- 1. Silêncio de 30 minutos ------------------------------------------
  // Última atividade há 30min+, ainda em modo bot, sem aviso pendente.
  const silent30 = await db.whatsAppConversation.findMany({
    where: {
      status: 'bot',
      botNudge30At: null,
      lastMessageAt: { lte: new Date(now - NUDGE_AFTER_MS) },
    },
    include: { contact: true },
    take: 25,
  });

  for (const conv of silent30) {
    try {
      // Só cutuca se a ÚLTIMA mensagem foi do bot (pergunta sem resposta).
      const last = await db.whatsAppMessage.findFirst({
        where: { contactId: conv.contactId, internal: false, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { direction: true, sentByBot: true },
      });
      if (!last || last.direction !== 'out' || !last.sentByBot) {
        // Marca mesmo assim pra não reavaliar essa conversa a cada rodada.
        await db.whatsAppConversation.update({ where: { id: conv.id }, data: { botNudge30At: new Date() } });
        continue;
      }
      await sendBotReply(conv.contactId, conv.contact.phone, conv.contact.name, NUDGE_30MIN);
      await db.whatsAppConversation.update({ where: { id: conv.id }, data: { botNudge30At: new Date() } });
      results.nudged30++;
    } catch (err) {
      console.error('[WHATSAPP CRON] Falha no nudge 30min:', conv.contactId, err);
      results.errors++;
    }
  }

  // ---- 2. Encerramento por inatividade -------------------------------------
  // Já levou o aviso há 10min+ e continua sem responder (se tivesse
  // respondido, botNudge30At teria sido zerado pelo service.ts) → despedida e
  // encerra, resetando a memória do bot. O desfecho (qualificada ou não) fica
  // como está no ticket.
  const silentAfterNudge = await db.whatsAppConversation.findMany({
    where: {
      status: 'bot',
      botNudge30At: { not: null, lte: new Date(now - CLOSE_AFTER_MS) },
    },
    include: { contact: true },
    take: 25,
  });

  for (const conv of silentAfterNudge) {
    try {
      try {
        const farewell = await buildFarewell(conv.contactId, conv.contact.name);
        await sendBotReply(conv.contactId, conv.contact.phone, conv.contact.name, farewell);
      } catch (err) {
        // Janela de 24h pode ter fechado — encerra mesmo sem conseguir avisar.
        console.error('[WHATSAPP CRON] Despedida não entregue (encerrando mesmo assim):', conv.contactId, err);
      }
      await db.whatsAppConversation.update({
        where: { id: conv.id },
        data: {
          status: 'closed',
          assignedToId: null,
          botMemory: null,
          botState: null,
          botFailCount: 0,
          botNudge30At: null,
          botNudge24At: null,
          urgent: false,
          queuedAt: null,
          queueAlertAt: null,
        },
      });
      results.closed++;
    } catch (err) {
      console.error('[WHATSAPP CRON] Falha ao encerrar por inatividade:', conv.contactId, err);
      results.errors++;
    }
  }

  // ---- 3. SLA da fila de espera ---------------------------------------------
  // Cliente parado em "queued" há QUEUE_SLA_MS sem atendente → re-notifica a
  // equipe. queueAlertAt evita spam: só alerta de novo depois de QUEUE_REALERT_MS.
  const waitingTooLong = await db.whatsAppConversation.findMany({
    where: {
      status: 'queued',
      queuedAt: { not: null, lte: new Date(now - QUEUE_SLA_MS) },
      OR: [
        { queueAlertAt: null },
        { queueAlertAt: { lte: new Date(now - QUEUE_REALERT_MS) } },
      ],
    },
    include: { contact: true },
    take: 25,
  });

  if (waitingTooLong.length) {
    const recipients = await whatsappRecipients().catch(() => [] as string[]);
    const discordUrl = process.env.DISCORD_WEBHOOK_URL_WHATSAPP;

    for (const conv of waitingTooLong) {
      try {
        const label = conv.contact.name ?? `+${conv.contact.phone}`;
        const waitingMin = conv.queuedAt ? Math.round((now - conv.queuedAt.getTime()) / 60_000) : 0;
        const urgentPrefix = conv.urgent ? '🔴 URGENTE — ' : '';

        for (const id of recipients) {
          await db.notification.create({
            data: {
              recipientId: id,
              authorId: 'whatsapp-bot',
              authorName: '🤖 Bot WhatsApp',
              targetName: label,
              message: `${urgentPrefix}WhatsApp: ${label} está há ${waitingMin} min na fila sem atendimento!`,
              contactId: conv.contactId,
            },
          });
        }
        if (discordUrl) {
          await fetch(discordUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              embeds: [{
                title: `${conv.urgent ? '🔴' : '⏰'} Cliente esperando na fila do WhatsApp`,
                description: `**${label}**\nHá ${waitingMin} min na fila sem atendente.`,
                color: conv.urgent ? 0xef4444 : 0xf59e0b,
                timestamp: new Date().toISOString(),
              }],
            }),
          }).catch(() => {});
        }
        await db.whatsAppConversation.update({
          where: { id: conv.id },
          data: { queueAlertAt: new Date() },
        });
        results.queueAlerts++;
      } catch (err) {
        console.error('[WHATSAPP CRON] Falha no alerta de fila:', conv.contactId, err);
        results.errors++;
      }
    }
  }

  // ---- 4. Mensagem enviada e nunca entregue ---------------------------------
  // "sent" há 12h+ sem virar "delivered" = provável bloqueio ou número errado.
  // Política: NÃO paramos de enviar pro número — a conversa vai pra fila e a
  // equipe recebe notificação pedindo pra verificar (número correto? bloqueou?
  // janela de 24h expirou?). O debounce por conversa (deliveryAlertAt, 6h)
  // fica dentro de alertDeliveryFailure.
  const stuck = await db.whatsAppMessage.groupBy({
    by: ['contactId'],
    where: {
      direction: 'out',
      status: 'sent',
      internal: false,
      deletedAt: null,
      createdAt: {
        gte: new Date(now - STUCK_SENT_LOOKBACK_MS),
        lte: new Date(now - STUCK_SENT_MS),
      },
    },
    _count: { _all: true },
    orderBy: { contactId: 'asc' },
    take: 25,
  });

  for (const group of stuck) {
    try {
      const n = group._count._all;
      await alertDeliveryFailure(
        group.contactId,
        `${n === 1 ? 'mensagem enviada há mais de 12h segue' : `${n} mensagens enviadas seguem`} sem confirmação de entrega (possível bloqueio ou número incorreto)`,
      );
      results.deliveryAlerts++;
    } catch (err) {
      console.error('[WHATSAPP CRON] Falha no alerta de entrega:', group.contactId, err);
      results.errors++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/_shared/lib/prisma';
import { sendBotReply } from '@/app/_shared/lib/whatsapp/bot';

// Detector de silêncio do bot (rodado por cron — vercel.json, a cada 15min):
//
// 1. Cliente sumiu há 30min+ → "Você precisa de mais alguma coisa? 😊"
//    Se ele responder, o atendimento segue normalmente (o marcador
//    botNudge30At é zerado pelo service.ts quando chega mensagem).
// 2. Cliente segue sem responder 10min+ depois do aviso → despedida curta e
//    encerra o ticket, ZERANDO a memória/estado do bot (qualificado ou não).
//    Os dados de cadastro do cliente (nome, CPF etc.) continuam na ficha do
//    kanban — o bot só volta a receber nome/etapa/serviço, nunca dados
//    sensíveis.
//
// Auth: o Vercel Cron manda "Authorization: Bearer ${CRON_SECRET}" quando a
// env CRON_SECRET existe; também aceita ?secret= pra disparo manual/externo.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NUDGE_30MIN = 'Você precisa de mais alguma coisa? 😊';
const FAREWELL =
  'Como não tivemos retorno, vou encerrar nosso atendimento por aqui, tá bom? Qualquer coisa é só mandar uma mensagem que a gente continua. 😊';

const NUDGE_AFTER_MS = 30 * 60_000; // 30min sem resposta → pergunta
const CLOSE_AFTER_MS = 10 * 60_000; // +10min sem resposta → encerra

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
  const results = { nudged30: 0, closed: 0, errors: 0 };

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
        await sendBotReply(conv.contactId, conv.contact.phone, conv.contact.name, FAREWELL);
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
        },
      });
      results.closed++;
    } catch (err) {
      console.error('[WHATSAPP CRON] Falha ao encerrar por inatividade:', conv.contactId, err);
      results.errors++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}

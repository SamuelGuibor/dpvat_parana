import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/app/_shared/lib/prisma';
import { sendBotReply } from '@/app/_shared/lib/whatsapp/bot';
import { captureConversation } from '@/app/_shared/lib/whatsapp/brain';
import { recordFollowupDecision } from '@/app/_shared/lib/whatsapp/rule-events';
import { recordRecoveryEvent } from '@/app/_shared/lib/whatsapp/rule-events';
import { whatsappRecipients, alertDeliveryFailure } from '@/app/_shared/lib/whatsapp/service';
import { isWindowOpen, sendSystemWhatsApp } from '@/app/_shared/lib/whatsapp/outbound';
import { runSignatureReminders } from '@/app/_shared/lib/whatsapp/signature';

// Detector de silêncio do bot (rodado pelo Vercel Cron — vercel.json — a cada
// 15min; o whatsapp-cron.cmd continua servindo pra disparo manual em dev):
//
// 1. Cliente sumiu há 30min+ → "Você precisa de mais alguma coisa? 😊"
//    Se ele responder, o atendimento segue normalmente (o marcador
//    botNudge30At é zerado pelo service.ts quando chega mensagem).
// 2. Cliente segue sem responder 10min+ depois do aviso → despedida (gerada
//    pela IA com base na conversa; texto fixo como fallback). Se a triagem
//    ficou PENDENTE (não qualificado), a conversa NÃO fecha: entra em
//    "standby" — o ciclo de RECUPERAÇÃO (fase 2b) manda até 3 provocações em
//    ~3 dias tentando resgatar o cliente. Qualificado/opt-out fecha como antes.
// 2b. Ciclo de recuperação: provocações agendadas em recoveryNextAt, só em
//    horário comercial (7h–21h BRT). Janela de 24h aberta → texto livre
//    contextual da IA; fechada → template aprovado na Meta
//    (recuperacao_triagem_1 / recuperacao_triagem_final). Após a 3ª sem
//    resposta → encerra como closeCategory="sem_resposta".
// 3. SLA da fila de espera: cliente em "queued" há 10min+ sem atendente →
//    re-notifica a equipe (Notification + Discord); repete a cada 1h.
//
// Auth: o Vercel Cron manda "Authorization: Bearer ${CRON_SECRET}" quando a
// env CRON_SECRET existe; também aceita ?secret= pra disparo manual/externo.

export const dynamic = 'force-dynamic';
// 300s (teto do Pro): a rodada pode gerar N despedidas contextuais (fetch de
// até 15s cada na IA) + varrer até 60 cards estourados — 60s não dava folga.
export const maxDuration = 300;

const NUDGE_30MIN = 'Você precisa de mais alguma coisa?';
const FAREWELL =
  'Como não tivemos retorno, vou encerrar nosso atendimento por aqui, tá bom? Qualquer coisa é só mandar uma mensagem que a gente continua.';

const NUDGE_AFTER_MS = 30 * 60_000; // 30min sem resposta → pergunta
const CLOSE_AFTER_MS = 10 * 60_000; // +10min sem resposta → encerra
const QUEUE_SLA_MS = 10 * 60_000;   // 10min na fila sem atendente → alerta
const QUEUE_REALERT_MS = 60 * 60_000; // repete o alerta a cada 1h
const HUMAN_SLA_MS = 30 * 60_000;   // 30min sem resposta do atendente → cobra o dono
// Mensagem "sent" que nunca virou "delivered": quando um número BLOQUEIA a
// empresa a Meta nem manda status "failed" — a mensagem só fica travada no
// tique único. 12h+ nesse estado → alerta de verificação pra equipe.
const STUCK_SENT_MS = 12 * 60 * 60_000;
const STUCK_SENT_LOOKBACK_MS = 72 * 60 * 60_000; // ignora histórico antigo

// Cards ESTOURADOS no kanban: card parado numa coluna além do timeLimitDays
// dela → notificação pra equipe INTEIRA, re-notificada a cada 24h enquanto o
// card não sair da coluna. Se estourou, algo deu errado — ninguém pode deixar
// de ver.
const OVERDUE_RENOTIFY_MS = 24 * 60 * 60_000;
const OVERDUE_AUTHOR_ID = 'kanban-overdue';
const OVERDUE_MAX_CARDS = 60; // teto por rodada (os mais atrasados primeiro)

// ---- Ciclo de RECUPERAÇÃO (status "standby") --------------------------------
// Até 3 provocações tentando resgatar quem sumiu no meio da triagem. A 1ª sai
// ~22h depois da última mensagem do CLIENTE (ainda dentro da janela de 24h da
// Meta → texto livre contextual da IA); as seguintes a cada 24h — se a janela
// reabriu (cliente interagiu), texto livre; senão, template aprovado.
const RECOVERY_MAX_ATTEMPTS = 3;
const RECOVERY_FIRST_AFTER_MS = 22 * 60 * 60_000; // após a última msg do cliente
const RECOVERY_GAP_MS = 24 * 60 * 60_000;         // entre tentativas
const RECOVERY_RETRY_MS = 6 * 60 * 60_000;        // re-tenta envios que falharam
// Templates aprovados na Meta (criados manualmente e sincronizados no CRM):
//   _1: corpo com {{1}} = primeiro nome.
//   _final: {{1}} = primeiro nome, {{2}} = pendência ("enviar seus documentos").
const RECOVERY_TEMPLATE_1 = 'recuperacao_triagem_1';
const RECOVERY_TEMPLATE_FINAL = 'recuperacao_triagem_final';

// Horário comercial (7h–21h, Brasília): provocação fora disso é adiada pro
// próximo dia útil de relógio — cutucar às 3h da manhã é convite a denúncia.
const BRT_OFFSET_MS = -3 * 60 * 60_000;
const BUSINESS_START_H = 7;
const BUSINESS_END_H = 21;

/** Devolve o próprio instante se cai no horário comercial BRT; senão, as 7h BRT seguintes. */
function nextBusinessSlot(ts: number): Date {
  const wall = new Date(ts + BRT_OFFSET_MS); // relógio de Brasília em campos UTC
  const h = wall.getUTCHours();
  if (h >= BUSINESS_START_H && h < BUSINESS_END_H) return new Date(ts);
  const dayStart = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  const addDays = h < BUSINESS_START_H ? 0 : 1;
  return new Date(dayStart + addDays * 24 * 60 * 60_000 + BUSINESS_START_H * 60 * 60_000 - BRT_OFFSET_MS);
}

/** Fallback local da pendência ({{2}} do template final) a partir do botState. */
function pendingFromState(state: string | null): string {
  const s = (state ?? '').toLowerCase();
  if (s.includes('doc')) return 'enviar seus documentos';
  if (s.includes('relato') || s.includes('acidente')) return 'me contar como foi o acidente';
  if (s.includes('cpf') || s.includes('coleta') || s.includes('cadastro') || s.includes('endereco'))
    return 'completar seus dados';
  return 'continuar seu atendimento';
}

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

// Heurística local de fecho: usada SÓ como fallback quando a IA está fora, pra
// não voltar a re-pingar uma despedida óbvia. A decisão "de verdade" é a da IA
// (decideFollowup); isto é só a rede de segurança.
function looksLikeFarewell(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  if (/\b(boa noite|bom dia|boa tarde)\b/.test(t) && /(amanh|depois|descanse|deus|abra[çc]|at[eé] mais|falamos|conversamos)/.test(t)) return true;
  if (/(at[eé] amanh|falamos amanh|conversamos amanh|converso com voc[eê] amanh|fica com deus|com deus|descanse|durma bem|bom descanso|nos falamos)/.test(t)) return true;
  // "te envio amanhã", "aguardo ... amanhã", "amanhã cedo" → retorno combinado.
  if (/amanh/.test(t) && /(envio|mando|te envio|aguardo|cedo|manh[aã]|retorno|falo)/.test(t)) return true;
  return false;
}

/**
 * Decisão CONTEXTUAL de follow-up: pergunta ao microserviço da IA se, dado o
 * estado da conversa, ainda cabe cutucar o cliente ("nudge") ou se ela já teve
 * um fecho natural e deve encerrar em silêncio ("close"). Qualquer falha (IA
 * fora, timeout, endpoint sem deploy) cai numa heurística local — nunca trava
 * a rodada do cron.
 */
async function decideFollowup(
  contactId: string,
  contactName: string | null,
  lastBotText: string | null,
): Promise<{ action: 'nudge' | 'close'; message: string; reason: string }> {
  const localFallback = (): { action: 'nudge' | 'close'; message: string; reason: string } =>
    looksLikeFarewell(lastBotText)
      ? { action: 'close', message: '', reason: 'heurística local: última mensagem do bot já era despedida' }
      : { action: 'nudge', message: '', reason: 'heurística local: IA indisponível' };

  if (!CHATBOT_URL || !CHATBOT_SECRET) return localFallback();
  try {
    const [history, conv] = await Promise.all([
      db.whatsAppMessage.findMany({
        where: { contactId, internal: false, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { direction: true, sentByBot: true, body: true },
      }),
      db.whatsAppConversation.findUnique({
        where: { contactId },
        select: { botMemory: true, botState: true },
      }),
    ]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const res = await fetch(`${CHATBOT_URL}/followup-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bot-secret': CHATBOT_SECRET },
        body: JSON.stringify({
          contact: { name: contactName },
          memory: conv?.botMemory ?? null,
          state: conv?.botState ?? null,
          history: history
            .reverse()
            .filter((h) => h.body)
            .map((h) => ({ role: h.direction === 'in' ? 'client' : h.sentByBot ? 'bot' : 'agent', text: h.body })),
        }),
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`followup-decision HTTP ${res.status}`);
      const data = await res.json();
      const action = data?.action === 'close' ? 'close' : 'nudge';
      // No close a message também pode vir: frase única e suave de fecho quando
      // o bot ainda não tinha se despedido (vazia = silêncio total).
      return { action, message: String(data?.message ?? '').trim(), reason: String(data?.reason ?? '').trim() };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn('[WHATSAPP CRON] Decisão de follow-up por IA indisponível (heurística local):', err);
    return localFallback();
  }
}

/**
 * Encerra a conversa por inatividade: snapshot pro cérebro antes do update e
 * reset dos marcadores. A ficha (botMemory/botState) é PRESERVADA em todos os
 * desfechos (25/07/2026): se o cliente escrever de novo, a reabertura vem com
 * contexto e a IA não recomeça a triagem — a limpeza, se couber, acontece na
 * reabertura por idade (service.ts). Compartilhado pela fase 1 (decisão
 * "close" da IA), pela fase 2 (silêncio após o cutucão, quando não elegível a
 * standby) e pelos desfechos do ciclo de recuperação (fase 2b).
 */
async function finalizeClose(
  conv: { id: string; contactId: string; qualified: boolean | null },
  opts?: { closeCategory?: string; recoveryOutcome?: string },
): Promise<void> {
  await captureConversation(conv.contactId, 'cron_silencio');
  await db.whatsAppConversation.update({
    where: { id: conv.id },
    data: {
      status: 'closed',
      assignedToId: null,
      botFailCount: 0,
      botNudge30At: null,
      botNudge24At: null,
      urgent: false,
      queuedAt: null,
      queueAlertAt: null,
      recoveryNextAt: null,
      ...(opts?.closeCategory ? { closeCategory: opts.closeCategory } : {}),
      ...(opts?.recoveryOutcome ? { recoveryOutcome: opts.recoveryOutcome } : {}),
    },
  });
}

/**
 * Entrada no STANDBY (ciclo de recuperação): em vez de fechar a conversa de
 * quem sumiu com triagem pendente, agenda a 1ª provocação — ~22h depois da
 * última mensagem do CLIENTE, pra ainda pegar a janela de 24h da Meta (texto
 * livre contextual). Se o ciclo está sendo RETOMADO (cliente voltou depois de
 * uma provocação e sumiu de novo), a mesma conta vale: a próxima sai ~22h
 * depois da última mensagem dele, contador preservado.
 */
async function enterStandby(conv: { id: string; contactId: string }): Promise<void> {
  const lastInbound = await db.whatsAppMessage.findFirst({
    where: { contactId: conv.contactId, direction: 'in', deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const base = (lastInbound?.createdAt.getTime() ?? Date.now()) + RECOVERY_FIRST_AFTER_MS;
  await db.whatsAppConversation.update({
    where: { id: conv.id },
    data: {
      status: 'standby',
      assignedToId: null,
      botFailCount: 0,
      botNudge30At: null,
      botNudge24At: null,
      urgent: false,
      queuedAt: null,
      queueAlertAt: null,
      recoveryNextAt: nextBusinessSlot(Math.max(base, Date.now() + 60_000)),
      recoveryOutcome: null,
    },
  });
}

/**
 * Provocação CONTEXTUAL: pede à IA o texto da tentativa (usado quando a janela
 * de 24h está aberta) e a PENDÊNCIA curta ("enviar seus documentos") usada no
 * {{2}} do template final quando a janela está fechada. Qualquer falha cai em
 * textos fixos + pendência derivada do botState — o ciclo nunca trava na IA.
 */
async function buildRecoveryMessage(
  contactId: string,
  contactName: string | null,
  attempt: number,
  botState: string | null,
): Promise<{ message: string; pending: string }> {
  const first = (contactName ?? '').trim().split(/\s+/)[0] ?? '';
  const oi = first ? `Oi, ${first}!` : 'Oi!';
  const fallbackMessages: Record<number, string> = {
    1: `${oi} Vi que a gente começou seu atendimento sobre o acidente, mas ficou faltando bem pouco pra concluir. Posso continuar de onde paramos? É rapidinho. 😊`,
    2: `${oi} Ainda dá tempo de dar andamento no seu caso — falta muito pouco pra gente concluir sua análise. É só me responder por aqui que eu continuo na hora. 🙏`,
    3: `${first ? `${first}, essa` : 'Essa'} é minha última mensagem, tá? Seu atendimento está quase pronto e seria uma pena parar agora que falta tão pouco. Se ainda tiver interesse, é só responder que a gente termina juntos. 🙏`,
  };
  const fallback = {
    message: fallbackMessages[Math.min(attempt, 3)] ?? fallbackMessages[3],
    pending: pendingFromState(botState),
  };
  if (!CHATBOT_URL || !CHATBOT_SECRET) return fallback;
  try {
    const [history, conv] = await Promise.all([
      db.whatsAppMessage.findMany({
        where: { contactId, internal: false, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { direction: true, sentByBot: true, body: true },
      }),
      db.whatsAppConversation.findUnique({
        where: { contactId },
        select: { botMemory: true, botState: true },
      }),
    ]);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch(`${CHATBOT_URL}/recovery-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-bot-secret': CHATBOT_SECRET },
        body: JSON.stringify({
          contact: { name: contactName },
          memory: conv?.botMemory ?? null,
          state: conv?.botState ?? null,
          attempt,
          maxAttempts: RECOVERY_MAX_ATTEMPTS,
          history: history
            .reverse()
            .filter((h) => h.body)
            .map((h) => ({ role: h.direction === 'in' ? 'client' : h.sentByBot ? 'bot' : 'agent', text: h.body })),
        }),
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`recovery-message HTTP ${res.status}`);
      const data = await res.json();
      return {
        message: String(data?.message ?? '').trim() || fallback.message,
        pending: String(data?.pending ?? '').trim() || fallback.pending,
      };
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    console.warn('[WHATSAPP CRON] Provocação por IA indisponível (usando texto fixo):', err);
    return fallback;
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
  const results = { nudged30: 0, closed: 0, standby: 0, recoverySent: 0, signatureReminders: 0, signaturesByPolling: 0, queueAlerts: 0, deliveryAlerts: 0, overdueAlerts: 0, errors: 0 };

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
        select: { direction: true, sentByBot: true, body: true },
      });
      if (!last || last.direction !== 'out' || !last.sentByBot) {
        // Marca mesmo assim pra não reavaliar essa conversa a cada rodada.
        await db.whatsAppConversation.update({ where: { id: conv.id }, data: { botNudge30At: new Date() } });
        continue;
      }
      // Janela de 24h fechada → texto livre seria recusado pela Meta (131047).
      // Não tenta: taxa de erro alta também derruba a nota de qualidade da
      // conta. Marca o nudge pra fase 2 encerrar a conversa em silêncio.
      if (!(await isWindowOpen(conv.contactId))) {
        await db.whatsAppConversation.update({ where: { id: conv.id }, data: { botNudge30At: new Date() } });
        continue;
      }
      // A IA lê a conversa e decide: cutucar (há pendência real) ou encerrar em
      // silêncio (o bot já se despediu / o cliente combinou retorno). Evita o
      // "Você precisa de mais alguma coisa?" reabrindo uma conversa já fechada.
      const decision = await decideFollowup(conv.contactId, conv.contact.name, last.body);
      // Telemetria (aba Métricas da Revisão da IA): registra que a IA leu o
      // contexto e decidiu — best-effort, nunca trava o cron.
      await recordFollowupDecision({
        contactId: conv.contactId,
        contactName: conv.contact.name,
        botState: conv.botState ?? null,
        action: decision.action,
        detail: decision.reason || null,
      });
      if (decision.action === 'close') {
        // Fecho suave opcional: a IA só o preenche quando NINGUÉM se despediu
        // ainda — se o bot já disse "boa noite", encerra em silêncio total.
        if (decision.message) {
          try {
            await sendBotReply(conv.contactId, conv.contact.phone, conv.contact.name, decision.message);
          } catch (err) {
            console.error('[WHATSAPP CRON] Fecho suave não entregue (encerrando mesmo assim):', conv.contactId, err);
          }
        }
        await finalizeClose(conv);
        results.closed++;
        continue;
      }
      await sendBotReply(conv.contactId, conv.contact.phone, conv.contact.name, decision.message || NUDGE_30MIN);
      await db.whatsAppConversation.update({ where: { id: conv.id }, data: { botNudge30At: new Date() } });
      results.nudged30++;
    } catch (err) {
      console.error('[WHATSAPP CRON] Falha no nudge 30min:', conv.contactId, err);
      results.errors++;
    }
  }

  // ---- 2. Encerramento por inatividade -------------------------------------
  // Já levou o aviso há 10min+ e continua sem responder (se tivesse
  // respondido, botNudge30At teria sido zerado pelo service.ts) → despedida.
  // Triagem PENDENTE (não qualificado, sem opt-out, ciclo não esgotado) →
  // "standby": entra no ciclo de recuperação em vez de fechar. Os demais
  // fecham como antes.
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
        // Só se despede se a ÚLTIMA mensagem da conversa foi do PRÓPRIO BOT
        // (pergunta pendente). Caso Víctor (28/07): um atendente mandou
        // mensagens manuais e devolveu pro bot — o botNudge30At antigo ainda
        // estava armado e o cron despachou uma SEGUNDA despedida no mesmo dia,
        // em cima das mensagens do atendente. Última mensagem de agente ou do
        // cliente → encerra/standby em SILÊNCIO.
        const lastMsg = await db.whatsAppMessage.findFirst({
          where: { contactId: conv.contactId, internal: false, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { direction: true, sentByBot: true },
        });
        const botAskedLast = lastMsg?.direction === 'out' && lastMsg.sentByBot;
        // Janela fechada → nem tenta a despedida (evita o erro 131047 na
        // conta); encerra em silêncio.
        if (botAskedLast && (await isWindowOpen(conv.contactId))) {
          const farewell = await buildFarewell(conv.contactId, conv.contact.name);
          await sendBotReply(conv.contactId, conv.contact.phone, conv.contact.name, farewell);
        }
      } catch (err) {
        // Falha no envio não trava o encerramento.
        console.error('[WHATSAPP CRON] Despedida não entregue (encerrando mesmo assim):', conv.contactId, err);
      }
      const recoverable =
        !conv.qualified && !conv.contact.optedOut && conv.recoveryAttempts < RECOVERY_MAX_ATTEMPTS;
      if (recoverable) {
        await enterStandby(conv);
        results.standby++;
      } else {
        await finalizeClose(conv);
        results.closed++;
      }
    } catch (err) {
      console.error('[WHATSAPP CRON] Falha ao encerrar por inatividade:', conv.contactId, err);
      results.errors++;
    }
  }

  // ---- 2b. Ciclo de RECUPERAÇÃO (standby) -----------------------------------
  // Conversas em standby com provocação vencida. Cada rodada: honra opt-out,
  // esgota após a 3ª tentativa sem resposta, respeita horário comercial e
  // dispara via sendSystemWhatsApp (janela aberta → texto contextual da IA;
  // fechada → template aprovado, com nome + pendência nas variáveis).
  const dueRecovery = await db.whatsAppConversation.findMany({
    where: {
      status: 'standby',
      recoveryNextAt: { not: null, lte: new Date(now) },
    },
    include: { contact: true },
    take: 15,
  });

  for (const conv of dueRecovery) {
    try {
      // Descadastrou no meio do ciclo → encerra sem provocar.
      if (conv.contact.optedOut) {
        await recordRecoveryEvent({
          contactId: conv.contactId,
          contactName: conv.contact.name,
          botState: conv.botState,
          action: 'opt_out',
          attempt: conv.recoveryAttempts,
          detail: 'contato pediu para não receber mensagens durante o ciclo',
        });
        await finalizeClose(conv, { closeCategory: 'sem_resposta', recoveryOutcome: 'opt_out' });
        results.closed++;
        continue;
      }
      // 3 provocações e mais 24h de silêncio → não há o que fazer.
      if (conv.recoveryAttempts >= RECOVERY_MAX_ATTEMPTS) {
        await recordRecoveryEvent({
          contactId: conv.contactId,
          contactName: conv.contact.name,
          botState: conv.botState,
          action: 'exhausted',
          attempt: conv.recoveryAttempts,
          detail: 'ciclo completo sem resposta do cliente',
        });
        await finalizeClose(conv, { closeCategory: 'sem_resposta', recoveryOutcome: 'esgotado' });
        results.closed++;
        continue;
      }
      // Fora do horário comercial (9h–20h BRT) → adia pras próximas 9h.
      const slot = nextBusinessSlot(now);
      if (slot.getTime() > now) {
        await db.whatsAppConversation.update({ where: { id: conv.id }, data: { recoveryNextAt: slot } });
        continue;
      }

      const attempt = conv.recoveryAttempts + 1;
      const { message, pending } = await buildRecoveryMessage(
        conv.contactId,
        conv.contact.name,
        attempt,
        conv.botState,
      );
      const firstName = (conv.contact.name ?? '').trim().split(/\s+/)[0] || 'amigo(a)';
      const isFinal = attempt >= RECOVERY_MAX_ATTEMPTS;
      // Fora da janela de 24h só existem DOIS templates aprovados — e mandar o
      // MESMO recuperacao_triagem_1 em manhãs seguidas é spam literal (caso
      // Víctor: T1 e T2 idênticos, palavra por palavra). A partir da 2ª
      // tentativa o template já é o FINAL; se ele for usado (janela fechada),
      // o ciclo se encerra logo abaixo. Com janela aberta o texto é o da IA
      // (varia a cada tentativa) e as 3 tentativas continuam valendo.
      const useFinalTemplate = attempt >= 2;
      const sent = await sendSystemWhatsApp({
        phone: conv.contact.phone,
        clientName: conv.contact.name,
        text: message,
        templateName: useFinalTemplate ? RECOVERY_TEMPLATE_FINAL : RECOVERY_TEMPLATE_1,
        templateVars: useFinalTemplate ? [firstName, pending] : [firstName],
        authorId: 'whatsapp-bot',
        authorName: '🤖 Bot WhatsApp',
        source: 'recovery',
      });

      if (sent.sent) {
        // Template FINAL entregue ("essa é minha última mensagem") → não pode
        // haver outra provocação depois dele: esgota o contador para a próxima
        // rodada encerrar o ciclo, mesmo que ainda não fosse a 3ª tentativa.
        const sentFinalTemplate = sent.via === 'template' && useFinalTemplate;
        const attemptsAfter = sentFinalTemplate ? RECOVERY_MAX_ATTEMPTS : attempt;
        await recordRecoveryEvent({
          contactId: conv.contactId,
          contactName: conv.contact.name,
          botState: conv.botState,
          action: 'attempt',
          attempt,
          detail: sent.via === 'template'
            ? `template ${useFinalTemplate ? RECOVERY_TEMPLATE_FINAL : RECOVERY_TEMPLATE_1}${useFinalTemplate ? ` (pendência: ${pending})` : ''}${sentFinalTemplate && !isFinal ? ' — ciclo encerrado antecipadamente (não repetir template)' : ''}`
            : `texto livre: ${message.slice(0, 200)}`,
        });
        await db.whatsAppConversation.update({
          where: { id: conv.id },
          data: {
            recoveryAttempts: attemptsAfter,
            recoveryNextAt: nextBusinessSlot(now + RECOVERY_GAP_MS),
          },
        });
        results.recoverySent++;
      } else if (sent.reason?.includes('não receber')) {
        // Opt-out detectado pelo outbound.
        await recordRecoveryEvent({
          contactId: conv.contactId,
          contactName: conv.contact.name,
          botState: conv.botState,
          action: 'opt_out',
          attempt: conv.recoveryAttempts,
          detail: sent.reason,
        });
        await finalizeClose(conv, { closeCategory: 'sem_resposta', recoveryOutcome: 'opt_out' });
        results.closed++;
      } else if (sent.reason?.includes('opt-in')) {
        // Sem opt-in registrado nunca vai poder receber template → esgota já.
        await recordRecoveryEvent({
          contactId: conv.contactId,
          contactName: conv.contact.name,
          botState: conv.botState,
          action: 'exhausted',
          attempt: conv.recoveryAttempts,
          detail: sent.reason,
        });
        await finalizeClose(conv, { closeCategory: 'sem_resposta', recoveryOutcome: 'esgotado' });
        results.closed++;
      } else {
        // Cooldown anti-spam, template ainda não sincronizado, Meta rejeitou…
        // → re-tenta em 6h sem gastar tentativa (fica logado pelo outbound).
        await db.whatsAppConversation.update({
          where: { id: conv.id },
          data: { recoveryNextAt: nextBusinessSlot(now + RECOVERY_RETRY_MS) },
        });
      }
    } catch (err) {
      console.error('[WHATSAPP CRON] Falha na provocação de recuperação:', conv.contactId, err);
      results.errors++;
    }
  }

  // ---- 2c. Lembretes de ASSINATURA (ZapSign) --------------------------------
  // Procuração enviada e não assinada: até 3 lembretes (24h, horário
  // comercial, janela/template respeitados) + polling do status na ZapSign
  // como retaguarda do webhook. Esgotou → equipe assume o resgate manual.
  try {
    const sig = await runSignatureReminders(now);
    results.signatureReminders = sig.reminders;
    results.signaturesByPolling = sig.signedByPolling;
    results.errors += sig.errors;
  } catch (err) {
    console.error('[WHATSAPP CRON] Falha nos lembretes de assinatura:', err);
    results.errors++;
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

  // ---- 3b. SLA de atendimento HUMANO ----------------------------------------
  // Conversa em "human" onde o CLIENTE mandou a última mensagem e o atendente
  // está calado há 30min+ → re-alerta o dono; sem dono (buraco negro) ou
  // esperando há 2h+, escala pra equipe inteira. Antes não existia NENHUM SLA
  // pra "human": se o dono sumisse, o cliente esperava indefinidamente e
  // ninguém mais ficava sabendo. Debounce via queueAlertAt (re-alerta a cada
  // 1h), campo livre neste status.
  const humanStalled = await db.whatsAppConversation.findMany({
    where: {
      status: 'human',
      lastMessageAt: { lte: new Date(now - HUMAN_SLA_MS) },
      OR: [
        { queueAlertAt: null },
        { queueAlertAt: { lte: new Date(now - QUEUE_REALERT_MS) } },
      ],
    },
    include: { contact: true },
    take: 25,
  });

  for (const conv of humanStalled) {
    try {
      // Só cobra se quem falou por último foi o CLIENTE (atendente calado).
      const last = await db.whatsAppMessage.findFirst({
        where: { contactId: conv.contactId, internal: false, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { direction: true },
      });
      if (!last || last.direction !== 'in') continue;

      const label = conv.contact.name ?? `+${conv.contact.phone}`;
      const waitingMin = conv.lastMessageAt ? Math.round((now - conv.lastMessageAt.getTime()) / 60_000) : 0;
      const escalate = !conv.assignedToId || waitingMin >= 120;
      const recipients = escalate
        ? await whatsappRecipients().catch(() => [] as string[])
        : [conv.assignedToId as string];

      for (const id of recipients) {
        await db.notification.create({
          data: {
            recipientId: id,
            authorId: 'whatsapp-bot',
            authorName: '🤖 Bot WhatsApp',
            targetName: label,
            message: escalate
              ? `⏰ WhatsApp: ${label} está há ${waitingMin} min SEM RESPOSTA no atendimento humano${conv.assignedToId ? '' : ' (conversa sem dono!)'} — alguém precisa assumir.`
              : `⏰ WhatsApp: ${label} aguarda sua resposta há ${waitingMin} min.`,
            contactId: conv.contactId,
          },
        });
      }
      await db.whatsAppConversation.update({
        where: { id: conv.id },
        data: { queueAlertAt: new Date() },
      });
      results.queueAlerts++;
    } catch (err) {
      console.error('[WHATSAPP CRON] Falha no SLA de atendimento humano:', conv.contactId, err);
      results.errors++;
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

  // Conversa encerrada = caso resolvido pela equipe; não fica revalidando
  // entrega de mensagem antiga (era o que reabria tickets fechados de noite).
  const stuckContactIds = stuck.map((g) => g.contactId);
  const closedConvs = stuckContactIds.length
    ? await db.whatsAppConversation.findMany({
        where: { contactId: { in: stuckContactIds }, status: 'closed' },
        select: { contactId: true },
      })
    : [];
  const closedSet = new Set(closedConvs.map((c) => c.contactId));

  for (const group of stuck) {
    if (closedSet.has(group.contactId)) continue;
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

  // ---- 5. Cards ESTOURADOS no kanban (limite de dias da coluna) -------------
  // Colunas têm timeLimitDays; card com statusStartedAt além do limite gera
  // notificação pra equipe INTEIRA (o sino "incomoda" mesmo: repete a cada 24h
  // enquanto o card não sair da coluna — se estourou, algo deu errado).
  try {
    const limitedLabels = await db.label.findMany({
      where: { timeLimitDays: { not: null, gt: 0 } },
      select: { id: true, name: true, timeLimitDays: true },
    });

    if (limitedLabels.length) {
      const labelById = new Map(limitedLabels.map((l) => [l.id, l]));

      // O corte de data mais permissivo entre as colunas: filtra grosso no SQL
      // e refina por coluna em JS (cada coluna tem seu próprio limite).
      const minLimitDays = Math.min(...limitedLabels.map((l) => l.timeLimitDays!));
      const coarseCutoff = new Date(now - minLimitDays * 24 * 60 * 60_000);
      const labelIds = limitedLabels.map((l) => l.id);

      const [users, processes] = await Promise.all([
        db.user.findMany({
          where: {
            labelId: { in: labelIds },
            statusStartedAt: { not: null, lte: coarseCutoff },
            archiveStatus: null,
            role: { notIn: ['GHOST'] },
            NOT: { role: { startsWith: 'ADMIN' } },
          },
          select: { id: true, name: true, cardNumber: true, labelId: true, statusStartedAt: true },
        }),
        db.process.findMany({
          where: {
            labelId: { in: labelIds },
            statusStartedAt: { not: null, lte: coarseCutoff },
            archiveStatus: null,
          },
          select: { id: true, name: true, cardNumber: true, labelId: true, statusStartedAt: true },
        }),
      ]);

      type OverdueCard = {
        id: string; isProcess: boolean; name: string | null; cardNumber: number | null;
        labelName: string; limitDays: number; days: number;
      };
      const overdue: OverdueCard[] = [];
      for (const [rows, isProcess] of [[users, false], [processes, true]] as const) {
        for (const c of rows) {
          const label = c.labelId ? labelById.get(c.labelId) : null;
          if (!label || !c.statusStartedAt) continue;
          const days = Math.floor((now - c.statusStartedAt.getTime()) / (24 * 60 * 60_000));
          if (days > label.timeLimitDays!) {
            overdue.push({
              id: c.id, isProcess, name: c.name, cardNumber: c.cardNumber,
              labelName: label.name, limitDays: label.timeLimitDays!, days,
            });
          }
        }
      }

      if (overdue.length) {
        // Mais atrasados primeiro; teto por rodada pra não explodir o banco.
        overdue.sort((a, b) => b.days - a.days);
        const batch = overdue.slice(0, OVERDUE_MAX_CARDS);

        // Quem já foi avisado nas últimas 24h não é avisado de novo (por card).
        const recent = await db.notification.findMany({
          where: {
            authorId: OVERDUE_AUTHOR_ID,
            createdAt: { gte: new Date(now - OVERDUE_RENOTIFY_MS) },
          },
          select: { userId: true, processId: true },
          distinct: ['userId', 'processId'],
        });
        const alerted = new Set(recent.map((n) => n.processId ? `p:${n.processId}` : `u:${n.userId}`));

        const recipients = await whatsappRecipients().catch(() => [] as string[]);
        for (const card of batch) {
          const key = card.isProcess ? `p:${card.id}` : `u:${card.id}`;
          if (alerted.has(key)) continue;
          const cardLabel = `${card.cardNumber != null ? `#${card.cardNumber} ` : ''}${card.name ?? 'Sem nome'}`;
          const message =
            `⏰ ATRASADO: ${cardLabel} está há ${card.days} dias em "${card.labelName}" ` +
            `(limite: ${card.limitDays} ${card.limitDays === 1 ? 'dia' : 'dias'}). ` +
            `Se estourou o prazo, algo deu errado — verifique o card!`;
          try {
            await db.notification.createMany({
              data: recipients.map((recipientId) => ({
                recipientId,
                authorId: OVERDUE_AUTHOR_ID,
                authorName: '⏰ Prazo do Kanban',
                targetName: card.name ?? 'Card sem nome',
                message,
                userId: card.isProcess ? null : card.id,
                processId: card.isProcess ? card.id : null,
              })),
            });
            results.overdueAlerts++;
          } catch (err) {
            console.error('[WHATSAPP CRON] Falha no alerta de card atrasado:', card.id, err);
            results.errors++;
          }
        }
      }
    }
  } catch (err) {
    console.error('[WHATSAPP CRON] Falha na varredura de cards atrasados:', err);
    results.errors++;
  }

  return NextResponse.json({ ok: true, ...results });
}

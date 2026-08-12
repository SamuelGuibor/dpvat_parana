import { db } from '@/app/_shared/lib/prisma';
import { sendBotReply, postInternalNote } from '@/app/_shared/lib/whatsapp/bot';
import { captureConversation } from '@/app/_shared/lib/whatsapp/brain';
import { recordFollowupDecision } from '@/app/_shared/lib/whatsapp/rule-events';
import { recordRecoveryEvent, recordCodeIntervention } from '@/app/_shared/lib/whatsapp/rule-events';
import { whatsappRecipients, alertDeliveryFailure } from '@/app/_shared/lib/whatsapp/service';
import { isWindowOpen, sendSystemWhatsApp } from '@/app/_shared/lib/whatsapp/outbound';

// FASES do cron de WhatsApp (07/08/2026) — o antigo /api/whatsapp/cron fazia
// tudo num passe só e sequencial; com multi-número o volume multiplica e as
// chamadas de IA (despedida/recuperação, até 15s cada) estouravam os 300s.
// Agora cada fase é uma função exportada, consumida por 3 rotas de cron
// separadas (sla / nudge / recovery), e o trabalho com IA roda em LOTES de
// BATCH_SIZE conversas em paralelo (Promise.allSettled — o try/catch por
// conversa continua valendo dentro de cada item).
//
// A rota antiga /api/whatsapp/cron segue existindo e roda as 3 fases em
// sequência — é o disparo manual de dev (whatsapp-cron.cmd) e o fallback.

const NUDGE_30MIN = 'Você precisa de mais alguma coisa?';
const FAREWELL =
  'Como não tivemos retorno, vou encerrar nosso atendimento por aqui, tá bom? Qualquer coisa é só mandar uma mensagem que a gente continua.';

const NUDGE_AFTER_MS = 30 * 60_000; // 30min sem resposta → pergunta
// +60min (era +10min) sem resposta → encerra. O ritmo antigo mandava nudge e
// despedida em ~40min e o lead "sumia" da triagem rápido demais (11/08/2026).
const CLOSE_AFTER_MS = 60 * 60_000;
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
// card não sair da coluna.
const OVERDUE_RENOTIFY_MS = 24 * 60 * 60_000;
const OVERDUE_AUTHOR_ID = 'kanban-overdue';
const OVERDUE_MAX_CARDS = 60; // teto por rodada (os mais atrasados primeiro)

// ---- Ciclo de RECUPERAÇÃO (status "standby") --------------------------------
const RECOVERY_MAX_ATTEMPTS = 3;
const RECOVERY_FIRST_AFTER_MS = 22 * 60 * 60_000; // após a última msg do cliente
const RECOVERY_GAP_MS = 24 * 60 * 60_000;         // entre tentativas
const RECOVERY_RETRY_MS = 6 * 60 * 60_000;        // re-tenta envios que falharam
const RECOVERY_TEMPLATE_1 = 'recuperacao_triagem_1';
const RECOVERY_TEMPLATE_FINAL = 'recuperacao_triagem_final';

// Desfechos que NÃO são "sumiu no meio da triagem".
const NON_RECOVERABLE_CATEGORIES = new Set([
  'qualificado', 'contratado_perdido', 'perguntas', 'novo_acidente',
  'transferido', 'descartado', 'sem_resposta',
]);
const HUMAN_TOUCH_LOOKBACK_MS = 7 * 24 * 60 * 60_000;

// Concorrência das seções com IA: 4-5 chamadas simultâneas é seguro pro
// cérebro na Railway; mais que isso arrisca rate limit e timeouts em cascata.
const BATCH_SIZE = 4;

/** Roda fn para cada item, BATCH_SIZE por vez (falha de um não derruba o lote). */
// eslint-disable-next-line no-unused-vars
async function inBatches<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    await Promise.allSettled(items.slice(i, i + BATCH_SIZE).map(fn));
  }
}

/** Cronômetro por seção: aparece nos logs da Vercel pra ver o que cresce. */
async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    console.log(`[WHATSAPP CRON] ${label}: ${Date.now() - t0}ms`);
  }
}

export interface CronResults {
  nudged30: number; closed: number; standby: number; recoverySent: number;
  queueAlerts: number; deliveryAlerts: number; overdueAlerts: number; errors: number;
}

function emptyResults(): CronResults {
  return { nudged30: 0, closed: 0, standby: 0, recoverySent: 0, queueAlerts: 0, deliveryAlerts: 0, overdueAlerts: 0, errors: 0 };
}

/**
 * O ciclo de recuperação existe para UM caso: lead novo que sumiu no meio da
 * triagem. Devolve o motivo pelo qual esta conversa NÃO deve entrar (ou seguir)
 * no ciclo — null significa "pode provocar". (Caso Daniel, 06/08/2026.)
 */
async function standbyBlockReason(conv: {
  contactId: string;
  qualified: boolean | null;
  closeCategory: string | null;
  recoveryAttempts: number;
  contact: { optedOut: boolean; userId: string | null };
}): Promise<string | null> {
  if (conv.contact.optedOut) return 'contato em opt-out';
  if (conv.recoveryAttempts >= RECOVERY_MAX_ATTEMPTS) return 'ciclo de recuperação já esgotado';
  if (conv.qualified === true) return 'lead já qualificado';
  if (conv.closeCategory && NON_RECOVERABLE_CATEGORIES.has(conv.closeCategory)) {
    return `desfecho "${conv.closeCategory}" não é triagem incompleta`;
  }
  if (conv.contact.userId) return 'contato já é cliente cadastrado (card no kanban)';
  const humanReply = await db.whatsAppMessage.findFirst({
    where: {
      contactId: conv.contactId,
      direction: 'out',
      sentByBot: false,
      authorId: { not: null },
      internal: false,
      deletedAt: null,
      createdAt: { gte: new Date(Date.now() - HUMAN_TOUCH_LOOKBACK_MS) },
    },
    select: { id: true },
  });
  if (humanReply) return 'conversa teve atendimento humano nos últimos 7 dias';
  return null;
}

// Horário comercial (7h–21h, Brasília).
const BRT_OFFSET_MS = -3 * 60 * 60_000;
const BUSINESS_START_H = 7;
const BUSINESS_END_H = 21;

function isBusinessHours(ts: number): boolean {
  const h = new Date(ts + BRT_OFFSET_MS).getUTCHours();
  return h >= BUSINESS_START_H && h < BUSINESS_END_H;
}

function nextBusinessSlot(ts: number): Date {
  if (isBusinessHours(ts)) return new Date(ts);
  const wall = new Date(ts + BRT_OFFSET_MS);
  const dayStart = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
  const addDays = wall.getUTCHours() < BUSINESS_START_H ? 0 : 1;
  return new Date(dayStart + addDays * 24 * 60 * 60_000 + BUSINESS_START_H * 60 * 60_000 - BRT_OFFSET_MS);
}

/** Minutos DE EXPEDIENTE entre dois instantes — a madrugada não conta. */
function businessMinutesBetween(from: number, to: number): number {
  if (to <= from) return 0;
  const DAY_MS = 24 * 60 * 60_000;
  let total = 0;
  let cursor = from;
  while (cursor < to) {
    const wall = new Date(cursor + BRT_OFFSET_MS);
    const dayStart = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) - BRT_OFFSET_MS;
    const open = dayStart + BUSINESS_START_H * 60 * 60_000;
    const close = dayStart + BUSINESS_END_H * 60 * 60_000;
    const segStart = Math.max(cursor, open);
    const segEnd = Math.min(to, close);
    if (segEnd > segStart) total += segEnd - segStart;
    cursor = dayStart + DAY_MS;
  }
  return Math.round(total / 60_000);
}

// Palavras de FECHO: a última mensagem do cliente ser dessas não é pergunta
// pendente, é o "tá bom, obrigada" que encerra o assunto.
const ACK_WORDS = new Set([
  'ok', 'okay', 'ta', 'tá', 'bom', 'boa', 'blz', 'beleza', 'certo', 'combinado',
  'entendi', 'entendido', 'obrigado', 'obrigada', 'obg', 'brigado', 'brigada',
  'vlw', 'valeu', 'amem', 'amém', 'então', 'entao', 'muito', 'tudo', 'bem',
  'show', 'perfeito', 'otimo', 'ótimo', 'legal', 'top', 'nada', 'de', 'tchau',
  'abraço', 'abraco', 'abraços', 'abracos', 'gratidão', 'gratidao', 'dia',
  'tarde', 'noite', 'deus', 'abençoe', 'abencoe', 'grato', 'grata',
]);

function isClosingAck(body: string | null, mediaType: string | null): boolean {
  const text = (body ?? '').trim();
  if (/\(rea[çc][ãa]o( removida)?\)$/i.test(text)) return true; // formato antigo: "👍 (reação)"
  if (/^(reagiu com\s|removeu a rea[çc][ãa]o$)/i.test(text)) return true; // "Reagiu com 👍"
  if (!text) return !mediaType || /webp/i.test(mediaType); // figurinha
  if (mediaType) return false; // legenda em cima de anexo = pendência
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return true; // só emoji
  if (words.length > 6) return false;
  return words.every((w) => ACK_WORDS.has(w));
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
 * Despedida CONTEXTUAL via IA; qualquer falha cai no texto fixo.
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

// Heurística local de fecho (rede de segurança quando a IA está fora).
function looksLikeFarewell(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  if (/\b(boa noite|bom dia|boa tarde)\b/.test(t) && /(amanh|depois|descanse|deus|abra[çc]|at[eé] mais|falamos|conversamos)/.test(t)) return true;
  if (/(at[eé] amanh|falamos amanh|conversamos amanh|converso com voc[eê] amanh|fica com deus|com deus|descanse|durma bem|bom descanso|nos falamos)/.test(t)) return true;
  if (/amanh/.test(t) && /(envio|mando|te envio|aguardo|cedo|manh[aã]|retorno|falo)/.test(t)) return true;
  return false;
}

/**
 * Decisão CONTEXTUAL de follow-up (nudge x close); falha cai na heurística.
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
 * Encerra a conversa por inatividade: snapshot pro cérebro + reset dos
 * marcadores. A ficha (botMemory/botState) é PRESERVADA (25/07/2026).
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

/** Entrada no STANDBY (ciclo de recuperação): agenda a 1ª provocação. */
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
 * Provocação CONTEXTUAL via IA + pendência do template final; falha cai em
 * textos fixos derivados do botState.
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

// ---------------------------------------------------------------------------
// FASE NUDGE (a cada 15min): silêncio de 30min + encerramento por inatividade.
// Tem chamadas de IA (followup-decision/farewell) → roda em lotes de 4.
// ---------------------------------------------------------------------------
export async function runNudgePhase(): Promise<CronResults> {
  const now = Date.now();
  const results = emptyResults();

  // ---- 1. Silêncio de 30 minutos ------------------------------------------
  const silent30 = await db.whatsAppConversation.findMany({
    where: {
      status: 'bot',
      botNudge30At: null,
      lastMessageAt: { lte: new Date(now - NUDGE_AFTER_MS) },
    },
    include: { contact: true },
    take: 25,
  });

  await timed(`nudge30 (${silent30.length} conversas)`, () => inBatches(silent30, async (conv) => {
    try {
      // Só cutuca se a ÚLTIMA mensagem foi do bot (pergunta sem resposta).
      const last = await db.whatsAppMessage.findFirst({
        where: { contactId: conv.contactId, internal: false, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { direction: true, sentByBot: true, body: true },
      });
      if (!last || last.direction !== 'out' || !last.sentByBot) {
        await db.whatsAppConversation.update({ where: { id: conv.id }, data: { botNudge30At: new Date() } });
        return;
      }
      // Janela de 24h fechada → texto livre seria recusado pela Meta (131047).
      if (!(await isWindowOpen(conv.contactId))) {
        await db.whatsAppConversation.update({ where: { id: conv.id }, data: { botNudge30At: new Date() } });
        return;
      }
      const decision = await decideFollowup(conv.contactId, conv.contact.name, last.body);
      await recordFollowupDecision({
        contactId: conv.contactId,
        contactName: conv.contact.name,
        botState: conv.botState ?? null,
        action: decision.action,
        detail: decision.reason || null,
      });
      if (decision.action === 'close') {
        if (decision.message) {
          try {
            await sendBotReply(conv.contactId, conv.contact.phone, conv.contact.name, decision.message);
          } catch (err) {
            console.error('[WHATSAPP CRON] Fecho suave não entregue (encerrando mesmo assim):', conv.contactId, err);
          }
        }
        // Sem closeCategory a conversa caía na pasta "Não qualificadas" pelo
        // fallback do inbox — lead bom parecia desqualificado (11/08/2026).
        await finalizeClose(conv, { closeCategory: conv.closeCategory ?? 'sem_resposta' });
        results.closed++;
        return;
      }
      await sendBotReply(conv.contactId, conv.contact.phone, conv.contact.name, decision.message || NUDGE_30MIN);
      await db.whatsAppConversation.update({ where: { id: conv.id }, data: { botNudge30At: new Date() } });
      results.nudged30++;
    } catch (err) {
      console.error('[WHATSAPP CRON] Falha no nudge 30min:', conv.contactId, err);
      results.errors++;
    }
  }));

  // ---- 2. Encerramento por inatividade -------------------------------------
  const silentAfterNudge = await db.whatsAppConversation.findMany({
    where: {
      status: 'bot',
      botNudge30At: { not: null, lte: new Date(now - CLOSE_AFTER_MS) },
    },
    include: { contact: true },
    take: 25,
  });

  await timed(`close (${silentAfterNudge.length} conversas)`, () => inBatches(silentAfterNudge, async (conv) => {
    try {
      try {
        // Só se despede se a ÚLTIMA mensagem foi do PRÓPRIO BOT (caso Víctor).
        const lastMsg = await db.whatsAppMessage.findFirst({
          where: { contactId: conv.contactId, internal: false, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { direction: true, sentByBot: true },
        });
        const botAskedLast = lastMsg?.direction === 'out' && lastMsg.sentByBot;
        if (botAskedLast && (await isWindowOpen(conv.contactId))) {
          const farewell = await buildFarewell(conv.contactId, conv.contact.name);
          await sendBotReply(conv.contactId, conv.contact.phone, conv.contact.name, farewell);
        }
      } catch (err) {
        console.error('[WHATSAPP CRON] Despedida não entregue (encerrando mesmo assim):', conv.contactId, err);
      }
      const block = await standbyBlockReason(conv);
      if (!block) {
        await enterStandby(conv);
        results.standby++;
      } else if (conv.qualified === true && conv.closeCategory !== 'qualificado') {
        // Lead QUALIFICADO que parou de responder NUNCA é encerrado pelo cron
        // (ele aparecia como "desqualificado" pra equipe) — vai pra fila
        // humana pra alguém retomar o contato. (11/08/2026)
        await recordCodeIntervention({
          contactId: conv.contactId,
          contactName: conv.contact.name,
          botState: conv.botState,
          action: 'fila_lead_qualificado',
          detail: 'Lead qualificado ficou em silêncio — enviado pra fila humana em vez de encerrar.',
        });
        await db.whatsAppConversation.update({
          where: { id: conv.id },
          data: { status: 'queued', queuedAt: new Date(), assignedToId: null, botNudge30At: null },
        });
        // O motivo na linha da Fila vem da última nota interna do bot.
        await postInternalNote(conv.contactId, '🤖 Transferido para atendimento humano — lead qualificado parou de responder; retomar contato.');
      } else {
        await recordCodeIntervention({
          contactId: conv.contactId,
          contactName: conv.contact.name,
          botState: conv.botState,
          action: 'recuperacao_bloqueada',
          detail: `Conversa encerrada sem entrar no ciclo de recuperação: ${block}.`,
        });
        // closeCategory de fallback: sem ela o inbox mostrava a conversa como
        // "não qualificada" mesmo quando o lead só ficou em silêncio.
        await finalizeClose(conv, { closeCategory: conv.closeCategory ?? 'sem_resposta' });
        results.closed++;
      }
    } catch (err) {
      console.error('[WHATSAPP CRON] Falha ao encerrar por inatividade:', conv.contactId, err);
      results.errors++;
    }
  }));

  return results;
}

// ---------------------------------------------------------------------------
// FASE RECOVERY (de hora em hora): ciclo de recuperação standby. As janelas
// são de 22–24h — rodar a cada 15min era desperdício de invocação.
// ---------------------------------------------------------------------------
export async function runRecoveryPhase(): Promise<CronResults> {
  const now = Date.now();
  const results = emptyResults();

  const dueRecovery = await db.whatsAppConversation.findMany({
    where: {
      status: 'standby',
      recoveryNextAt: { not: null, lte: new Date(now) },
    },
    include: { contact: true },
    take: 15,
  });

  await timed(`recovery (${dueRecovery.length} conversas)`, () => inBatches(dueRecovery, async (conv) => {
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
        return;
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
        return;
      }
      // Rede de segurança: nunca deveria ter entrado no ciclo.
      const block = await standbyBlockReason(conv);
      if (block) {
        // Lead qualificado no meio do ciclo → fila humana, nunca encerrar
        // silenciosamente (parecia desqualificado pra equipe). (11/08/2026)
        if (conv.qualified === true && conv.closeCategory !== 'qualificado') {
          await recordCodeIntervention({
            contactId: conv.contactId,
            contactName: conv.contact.name,
            botState: conv.botState,
            action: 'fila_lead_qualificado',
            detail: 'Lead qualificado saiu do ciclo de recuperação — enviado pra fila humana.',
          });
          await db.whatsAppConversation.update({
            where: { id: conv.id },
            data: { status: 'queued', queuedAt: new Date(), assignedToId: null, recoveryNextAt: null },
          });
          await postInternalNote(conv.contactId, '🤖 Transferido para atendimento humano — lead qualificado parou de responder; retomar contato.');
          return;
        }
        await recordCodeIntervention({
          contactId: conv.contactId,
          contactName: conv.contact.name,
          botState: conv.botState,
          action: 'recuperacao_bloqueada',
          detail: `Ciclo de recuperação interrompido antes da provocação: ${block}.`,
        });
        await finalizeClose(conv, {
          recoveryOutcome: 'bloqueado',
          closeCategory: conv.closeCategory ?? 'sem_resposta',
        });
        results.closed++;
        return;
      }
      // Fora do horário comercial → adia.
      const slot = nextBusinessSlot(now);
      if (slot.getTime() > now) {
        await db.whatsAppConversation.update({ where: { id: conv.id }, data: { recoveryNextAt: slot } });
        return;
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
      // A partir da 2ª tentativa o template já é o FINAL (não repetir template).
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
        // Cooldown, template não sincronizado, Meta rejeitou… → re-tenta em 6h.
        await db.whatsAppConversation.update({
          where: { id: conv.id },
          data: { recoveryNextAt: nextBusinessSlot(now + RECOVERY_RETRY_MS) },
        });
      }
    } catch (err) {
      console.error('[WHATSAPP CRON] Falha na provocação de recuperação:', conv.contactId, err);
      results.errors++;
    }
  }));

  return results;
}

// ---------------------------------------------------------------------------
// FASE SLA (a cada 15min): fila, SLA humano, entrega travada e cards
// estourados. SEM chamadas de IA — roda em segundos; é o cron que NÃO PODE
// atrasar (o alerta de cliente esperando é o mais crítico do sistema).
// ---------------------------------------------------------------------------
export async function runSlaPhase(): Promise<CronResults> {
  const now = Date.now();
  const results = emptyResults();

  // ---- 3. SLA da fila de espera ---------------------------------------------
  await timed('sla-fila', async () => {
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

    if (!waitingTooLong.length) return;
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
  });

  // ---- 3b. SLA de atendimento HUMANO ----------------------------------------
  await timed('sla-humano', async () => {
    const humanStalled = isBusinessHours(now)
      ? await db.whatsAppConversation.findMany({
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
        })
      : [];

    for (const conv of humanStalled) {
      try {
        const last = await db.whatsAppMessage.findFirst({
          where: { contactId: conv.contactId, internal: false, deletedAt: null },
          orderBy: { createdAt: 'desc' },
          select: { direction: true, body: true, mediaType: true },
        });
        if (!last || last.direction !== 'in') continue;
        if (isClosingAck(last.body, last.mediaType)) continue;

        const label = conv.contact.name ?? `+${conv.contact.phone}`;
        const waitingMin = conv.lastMessageAt
          ? businessMinutesBetween(conv.lastMessageAt.getTime(), now)
          : 0;
        if (waitingMin < HUMAN_SLA_MS / 60_000) continue;

        const owner = conv.assignedToId
          ? await db.user.findUnique({ where: { id: conv.assignedToId }, select: { name: true } })
          : null;
        const ownerName = owner?.name?.trim() || null;
        const escalate = !conv.assignedToId || waitingMin >= 120;
        const recipients = escalate
          ? await whatsappRecipients().catch(() => [] as string[])
          : [conv.assignedToId as string];

        const message = !conv.assignedToId
          ? `⏰ WhatsApp: ${label} está há ${waitingMin} min SEM RESPOSTA e a conversa está SEM DONO — alguém precisa assumir.`
          : escalate
            ? `⏰ WhatsApp: ${label} aguarda resposta de ${ownerName ?? 'o atendente responsável'} há ${waitingMin} min — se não puder atender agora, alguém assuma.`
            : `⏰ WhatsApp: ${label} aguarda sua resposta há ${waitingMin} min.`;

        for (const id of recipients) {
          await db.notification.create({
            data: {
              recipientId: id,
              authorId: 'whatsapp-bot',
              authorName: '🤖 Bot WhatsApp',
              targetName: label,
              message,
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
  });

  // ---- 4. Mensagem enviada e nunca entregue ---------------------------------
  await timed('entrega-travada', async () => {
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
  });

  // ---- 5. Cards ESTOURADOS no kanban (limite de dias da coluna) -------------
  await timed('cards-estourados', async () => {
    try {
      const limitedLabels = await db.label.findMany({
        where: { timeLimitDays: { not: null, gt: 0 } },
        select: { id: true, name: true, timeLimitDays: true },
      });

      if (!limitedLabels.length) return;
      const labelById = new Map(limitedLabels.map((l) => [l.id, l]));

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

      if (!overdue.length) return;
      overdue.sort((a, b) => b.days - a.days);
      const batch = overdue.slice(0, OVERDUE_MAX_CARDS);

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
    } catch (err) {
      console.error('[WHATSAPP CRON] Falha na varredura de cards atrasados:', err);
      results.errors++;
    }
  });

  return results;
}

/** Soma os contadores de duas fases (rota agregadora / disparo manual). */
export function mergeResults(...all: CronResults[]): CronResults {
  const out = emptyResults();
  for (const r of all) {
    for (const k of Object.keys(out) as (keyof CronResults)[]) out[k] += r[k];
  }
  return out;
}

import { db } from '@/app/_shared/lib/prisma';
import { sendBotReply } from '@/app/_shared/lib/whatsapp/bot';
import { captureConversation } from '@/app/_shared/lib/whatsapp/brain';
import { recordFollowupDecision } from '@/app/_shared/lib/whatsapp/rule-events';
import { recordRecoveryEvent, recordCodeIntervention } from '@/app/_shared/lib/whatsapp/rule-events';
import { whatsappRecipients, alertDeliveryFailure } from '@/app/_shared/lib/whatsapp/service';
import { isWindowOpen, sendSystemWhatsApp } from '@/app/_shared/lib/whatsapp/outbound';

// FASES do cron de WhatsApp (07/08/2026) — o antigo /api/whatsapp/cron fazia
// tudo num passe só e sequencial; com multi-número o volume multiplica e as
// chamadas de IA (despedida/recuperação, até 15s cada) estouravam os 300s.
// Agora cada fase é uma função exportada, consumida por 3 rotas de cron
// separadas (sla / nudge / recovery). Desde 13/08/2026 as fases que mandam
// mensagem pro cliente rodam UMA CONVERSA POR VEZ, com o marcapasso de envio
// (30–40s entre mensagens) — antes eram lotes de 4 em paralelo, o que fazia
// dezenas de disparos no mesmo minuto (cara de spam pra Meta).
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
const QUEUE_SLA_MS = 10 * 60_000;   // 10min na fila sem atendente → 1º alerta
// ESCALONAMENTO por degraus (16/08/2026): antes o alerta repetia DE HORA EM
// HORA para a equipe inteira enquanto ninguém assumisse — foram 24.612
// notificações em 7 dias (a MARILENE sozinha gerou 1.224) e o sino virou
// ruído branco que ninguém lê. Agora cada conversa dispara UM alerta por
// degrau ultrapassado e para: 4 avisos no máximo por estadia na fila.
const QUEUE_ALERT_STEPS_MS = [10 * 60_000, 60 * 60_000, 4 * 60 * 60_000, 24 * 60 * 60_000];
const HUMAN_SLA_MS = 30 * 60_000;   // 30min sem resposta do atendente → cobra o dono
const HUMAN_ALERT_STEPS_MS = [30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000];

/**
 * Degrau de alerta devido: o MAIOR degrau já ultrapassado desde `baseMs`, ou
 * null se nenhum. Alerta dispara quando o último alerta (alertAt) é anterior
 * ao degrau — cada degrau notifica uma única vez, sem re-alertas periódicos.
 * alertAt de uma estadia ANTIGA (menor que baseMs) não bloqueia nada.
 */
function dueAlertStep(steps: number[], baseMs: number, now: number, alertAt: Date | null): number | null {
  const due = [...steps].reverse().find((s) => baseMs + s <= now);
  if (due == null) return null;
  return !alertAt || alertAt.getTime() < baseMs + due ? due : null;
}
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
// 12/08/2026: 5 provocações no total — as 3 primeiras DENTRO da janela de 24h
// da Meta (texto livre, sem gastar template), as 2 últimas por template
// (recuperacao_triagem_1 e depois a final), espaçadas de 24h como antes.
const RECOVERY_MAX_ATTEMPTS = 5;
const RECOVERY_EARLY_ATTEMPTS = 3;                // texto livre na janela de 24h
const RECOVERY_FIRST_AFTER_MS = 4 * 60 * 60_000;  // 1ª provocação: 4h após a última msg do cliente
const RECOVERY_EARLY_GAP_MS = 8 * 60 * 60_000;    // entre as provocações da janela (4h, 12h, 20h)
const RECOVERY_GAP_MS = 24 * 60 * 60_000;         // entre as tentativas por template
const RECOVERY_RETRY_MS = 6 * 60 * 60_000;        // re-tenta envios que falharam
const RECOVERY_TEMPLATE_1 = 'recuperacao_triagem_1';
const RECOVERY_TEMPLATE_FINAL = 'recuperacao_triagem_final';

// Desfechos que NÃO são "sumiu no meio da triagem".
const NON_RECOVERABLE_CATEGORIES = new Set([
  'qualificado', 'contratado_perdido', 'perguntas', 'novo_acidente',
  'transferido', 'descartado', 'sem_resposta',
]);
const HUMAN_TOUCH_LOOKBACK_MS = 7 * 24 * 60 * 60_000;

// MARCAPASSO DE ENVIO (13/08/2026): o cron disparava dezenas de provocações
// no mesmo minuto (lotes de 4 em paralelo) — padrão que a Meta lê como spam e
// que derruba a qualidade do número. Agora as mensagens AUTOMÁTICAS pro
// cliente saem uma a uma, com 10–40s aleatórios entre elas — faixa larga de
// propósito: cadência irregular parece menos robô que um intervalo fixo.
// Ajustável sem deploy por WA_SEND_GAP_MIN_S / WA_SEND_GAP_MAX_S (segundos).
function envSeconds(key: string, fallbackMs: number): number {
  const raw = Number(process.env[key]);
  return Number.isFinite(raw) && raw > 0 ? raw * 1000 : fallbackMs;
}
const SEND_GAP_MIN_MS = envSeconds('WA_SEND_GAP_MIN_S', 7_000);
const SEND_GAP_MAX_MS = Math.max(SEND_GAP_MIN_MS, envSeconds('WA_SEND_GAP_MAX_S', 15_000));
// Teto de 300s por invocação (maxDuration): para em 4min e deixa o resto da
// fila pra próxima rodada do cron.
const RUN_BUDGET_MS = 240_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Pacer {
  // eslint-disable-next-line no-unused-vars
  slot(): Promise<boolean>;
  skipped(): number;
}

/**
 * Fila de envio: `slot()` segura a execução até o próximo horário livre e
 * devolve false quando o orçamento da rodada acabou (aí a conversa fica pra
 * próxima invocação, sem enviar nada).
 */
function createPacer(budgetMs = RUN_BUDGET_MS): Pacer {
  const startedAt = Date.now();
  let nextAt = 0; // o primeiro envio da rodada sai na hora
  let skipped = 0;
  return {
    async slot() {
      const waitMs = Math.max(0, nextAt - Date.now());
      if (Date.now() - startedAt + waitMs > budgetMs) {
        skipped++;
        return false;
      }
      if (waitMs) await sleep(waitMs);
      nextAt = Date.now() + SEND_GAP_MIN_MS + Math.floor(Math.random() * (SEND_GAP_MAX_MS - SEND_GAP_MIN_MS + 1));
      return true;
    },
    skipped: () => skipped,
  };
}

/** Uma conversa por vez — obrigatório onde o marcapasso controla o ritmo. */
// eslint-disable-next-line no-unused-vars
async function inSequence<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  for (const item of items) {
    try {
      await fn(item);
    } catch (err) {
      console.error('[WHATSAPP CRON] Item da fila falhou:', err);
    }
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
  // Atendimento humano só bloqueia a recuperação se o cliente RESPONDEU o
  // atendente — aí a conversa está viva e o bot não deve atropelar. Se o
  // humano falou e o cliente sumiu, é exatamente o lead que a recuperação
  // existe para resgatar. (13/08/2026 — casos "sem resposta" sem provocação.)
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
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (humanReply) {
    const clientAnswered = await db.whatsAppMessage.findFirst({
      where: {
        contactId: conv.contactId,
        direction: 'in',
        internal: false,
        deletedAt: null,
        createdAt: { gt: humanReply.createdAt },
      },
      select: { id: true },
    });
    if (clientAnswered) return 'conversa humana ativa (cliente respondeu o atendente)';
  }
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

/**
 * Desfecho de quem simplesmente ficou em silêncio.
 *
 * Lead JÁ qualificado nunca pode virar "sem resposta" (aparecia como
 * desqualificado pra equipe), mas também NÃO vai mais pra fila humana:
 * silêncio depois de uma pergunta respondida é o fim natural da conversa, não
 * um lead pra alguém perseguir — a fila enchia de conversa sem pendência
 * nenhuma. (13/08/2026, revertendo o "fila_lead_qualificado" de 11/08.)
 */
function silentCloseCategory(conv: { qualified: boolean | null; closeCategory: string | null }): string {
  return conv.closeCategory ?? (conv.qualified === true ? 'qualificado' : 'sem_resposta');
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
  // 1ª = retomada leve; do meio = insistência; a ÚLTIMA (5ª) é a despedida.
  const fallbackMessage =
    attempt >= RECOVERY_MAX_ATTEMPTS
      ? `${first ? `${first}, essa` : 'Essa'} é minha última mensagem, tá? Seu atendimento está quase pronto e seria uma pena parar agora que falta tão pouco. Se ainda tiver interesse, é só responder que a gente termina juntos. 🙏`
      : attempt === 1
        ? `${oi} Vi que a gente começou seu atendimento sobre o acidente, mas ficou faltando bem pouco pra concluir. Posso continuar de onde paramos? É rapidinho. 😊`
        : `${oi} Ainda dá tempo de dar andamento no seu caso — falta muito pouco pra gente concluir sua análise. É só me responder por aqui que eu continuo na hora. 🙏`;
  const fallback = {
    message: fallbackMessage,
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
export async function runNudgePhase(budgetMs?: number): Promise<CronResults> {
  const now = Date.now();
  const results = emptyResults();
  const pacer = createPacer(budgetMs);

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

  await timed(`nudge30 (${silent30.length} conversas)`, () => inSequence(silent30, async (conv) => {
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
      // Daqui pra frente a conversa vai receber mensagem: pega uma vaga na
      // fila de envio. Sem vaga, fica intacta pra próxima rodada do cron.
      if (!(await pacer.slot())) return;
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
        // Silêncio SEM desfecho real não pode virar "sem resposta" direto: é
        // lead que sumiu na triagem, tem que passar pelo ciclo de recuperação.
        // (13/08/2026 — caso Ambrosio, encerrado com 0 provocações.)
        if (!conv.closeCategory && !(await standbyBlockReason(conv))) {
          await enterStandby(conv);
          results.standby++;
          return;
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

  await timed(`close (${silentAfterNudge.length} conversas)`, () => inSequence(silentAfterNudge, async (conv) => {
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
          // Sem vaga na fila de envio: adia a conversa inteira (a despedida
          // faz parte do encerramento, não pode sair "solta" depois).
          if (!(await pacer.slot())) return;
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
      } else {
        await recordCodeIntervention({
          contactId: conv.contactId,
          contactName: conv.contact.name,
          botState: conv.botState,
          action: 'recuperacao_bloqueada',
          detail: `Conversa encerrada sem entrar no ciclo de recuperação: ${block}.`,
        });
        await finalizeClose(conv, { closeCategory: silentCloseCategory(conv) });
        results.closed++;
      }
    } catch (err) {
      console.error('[WHATSAPP CRON] Falha ao encerrar por inatividade:', conv.contactId, err);
      results.errors++;
    }
  }));

  if (pacer.skipped()) console.log(`[WHATSAPP CRON] nudge: ${pacer.skipped()} conversa(s) adiadas pra próxima rodada (fila de envio).`);
  return results;
}

// ---------------------------------------------------------------------------
// FASE RECOVERY (de hora em hora): ciclo de recuperação standby. As janelas
// são de 22–24h — rodar a cada 15min era desperdício de invocação.
// ---------------------------------------------------------------------------
export async function runRecoveryPhase(budgetMs?: number): Promise<CronResults> {
  const now = Date.now();
  const results = emptyResults();
  const pacer = createPacer(budgetMs);

  const dueRecovery = await db.whatsAppConversation.findMany({
    where: {
      status: 'standby',
      recoveryNextAt: { not: null, lte: new Date(now) },
    },
    include: { contact: true },
    take: 15,
  });

  await timed(`recovery (${dueRecovery.length} conversas)`, () => inSequence(dueRecovery, async (conv) => {
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
      // 5 provocações e mais 24h de silêncio → não há o que fazer.
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
        await recordCodeIntervention({
          contactId: conv.contactId,
          contactName: conv.contact.name,
          botState: conv.botState,
          action: 'recuperacao_bloqueada',
          detail: `Ciclo de recuperação interrompido antes da provocação: ${block}.`,
        });
        await finalizeClose(conv, {
          recoveryOutcome: 'bloqueado',
          closeCategory: silentCloseCategory(conv),
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

      // Vaga na fila de envio (30–40s entre provocações). Sem vaga, a
      // conversa continua "due" e sai na próxima rodada do cron.
      if (!(await pacer.slot())) return;

      const attempt = conv.recoveryAttempts + 1;
      const { message, pending } = await buildRecoveryMessage(
        conv.contactId,
        conv.contact.name,
        attempt,
        conv.botState,
      );
      const firstName = (conv.contact.name ?? '').trim().split(/\s+/)[0] || 'amigo(a)';
      const isFinal = attempt >= RECOVERY_MAX_ATTEMPTS;
      // Só a ÚLTIMA (5ª) usa o template final; a 4ª usa o template 1. As
      // tentativas 1-3 devem sair como texto livre (janela de 24h aberta) —
      // o template abaixo é só o fallback caso a janela já tenha fechado.
      const useFinalTemplate = isFinal;
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
        // Se uma tentativa "da janela" (1-3) acabou saindo por template, a
        // janela fechou — não faz sentido insistir em texto livre: pula
        // direto pra fase de templates (próxima = final, em 24h). Template
        // final enviado = ciclo completo, não repetir template.
        const attemptsAfter = sentFinalTemplate
          ? RECOVERY_MAX_ATTEMPTS
          : sent.via === 'template'
            ? Math.max(attempt, RECOVERY_MAX_ATTEMPTS - 1)
            : attempt;
        await recordRecoveryEvent({
          contactId: conv.contactId,
          contactName: conv.contact.name,
          botState: conv.botState,
          action: 'attempt',
          attempt,
          detail: sent.via === 'template'
            ? `template ${useFinalTemplate ? RECOVERY_TEMPLATE_FINAL : RECOVERY_TEMPLATE_1}${useFinalTemplate ? ` (pendência: ${pending})` : ''}${!isFinal ? ' — janela de 24h fechada, ciclo pulou pra fase de templates' : ''}`
            : `texto livre (janela de 24h): ${message.slice(0, 200)}`,
        });
        // Dentro da janela o intervalo é curto (8h); na fase de template, 24h.
        const gapMs = attemptsAfter < RECOVERY_EARLY_ATTEMPTS ? RECOVERY_EARLY_GAP_MS : RECOVERY_GAP_MS;
        await db.whatsAppConversation.update({
          where: { id: conv.id },
          data: {
            recoveryAttempts: attemptsAfter,
            recoveryNextAt: nextBusinessSlot(now + gapMs),
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

  if (pacer.skipped()) console.log(`[WHATSAPP CRON] recovery: ${pacer.skipped()} conversa(s) adiadas pra próxima rodada (fila de envio).`);
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
    const candidates = await db.whatsAppConversation.findMany({
      where: {
        status: 'queued',
        queuedAt: { not: null, lte: new Date(now - QUEUE_SLA_MS) },
      },
      include: { contact: true },
      take: 50,
    });
    // Um alerta por degrau (10min/1h/4h/24h) por estadia na fila — quem já foi
    // alertado no degrau atual fica em silêncio até cruzar o próximo.
    const waitingTooLong = candidates
      .filter((conv) => dueAlertStep(QUEUE_ALERT_STEPS_MS, conv.queuedAt!.getTime(), now, conv.queueAlertAt) != null)
      .slice(0, 25);

    if (!waitingTooLong.length) return;
    const recipients = await whatsappRecipients().catch(() => [] as string[]);

    for (const conv of waitingTooLong) {
      try {
        const label = conv.contact.name ?? `+${conv.contact.phone}`;
        const waitingMin = conv.queuedAt ? Math.round((now - conv.queuedAt.getTime()) / 60_000) : 0;
        const urgentPrefix = conv.urgent ? '🔴 URGENTE — ' : '';
        const stepIdx = QUEUE_ALERT_STEPS_MS.filter((s) => conv.queuedAt!.getTime() + s <= now).length;
        const stepSuffix = ` (aviso ${stepIdx}/${QUEUE_ALERT_STEPS_MS.length}${stepIdx >= QUEUE_ALERT_STEPS_MS.length ? ' — último' : ''})`;

        for (const id of recipients) {
          await db.notification.create({
            data: {
              recipientId: id,
              authorId: 'whatsapp-bot',
              authorName: '🤖 Bot WhatsApp',
              targetName: label,
              message: `${urgentPrefix}WhatsApp: ${label} está há ${waitingMin} min na fila sem atendimento!${stepSuffix}`,
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
        console.error('[WHATSAPP CRON] Falha no alerta de fila:', conv.contactId, err);
        results.errors++;
      }
    }
  });

  // ---- 3b. SLA de atendimento HUMANO ----------------------------------------
  await timed('sla-humano', async () => {
    const stalledCandidates = isBusinessHours(now)
      ? await db.whatsAppConversation.findMany({
          where: {
            status: 'human',
            lastMessageAt: { lte: new Date(now - HUMAN_SLA_MS) },
          },
          include: { contact: true },
          take: 50,
        })
      : [];
    // Mesmo escalonamento por degraus da fila (30min/2h/12h): a mensagem nova
    // do cliente move lastMessageAt e re-arma os degraus naturalmente.
    const humanStalled = stalledCandidates
      .filter((conv) => dueAlertStep(HUMAN_ALERT_STEPS_MS, conv.lastMessageAt.getTime(), now, conv.queueAlertAt) != null)
      .slice(0, 25);

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

import { db } from '@/app/_shared/lib/prisma';
import { handoffToQueue, sendBotReply } from '@/app/_shared/lib/whatsapp/bot';
import { captureConversation } from '@/app/_shared/lib/whatsapp/brain';
import { recordFollowupDecision } from '@/app/_shared/lib/whatsapp/rule-events';
import { recordRecoveryEvent, recordCodeIntervention } from '@/app/_shared/lib/whatsapp/rule-events';
import { whatsappRecipients, alertDeliveryFailure } from '@/app/_shared/lib/whatsapp/service';
import { waAlertRecipients } from '@/app/_shared/lib/whatsapp/alert-recipients';
import { isWindowOpen, sendSystemWhatsApp } from '@/app/_shared/lib/whatsapp/outbound';
import { activeNumberConversationWhere } from '@/app/_shared/lib/whatsapp/numbers';
import { RECOVERY_MAX_ATTEMPTS_DEFAULT, recoveryCapForPhoneNumberId } from '@/app/_shared/lib/whatsapp/recovery-caps';
import {
  brBusinessMinutesBetween, brStartOfDay, isBrBusinessHour, nextBrBusinessSlot,
} from '@/app/_shared/utils/date-br';
import {
  classifyLastMessage, isBotDecisionLog, isClosingAck, isEnvSwitchOn, orphanReason,
} from '@/app/_shared/utils/wa-silence';
import { holdDaysLabel, humanLastVerdict } from '@/app/_shared/utils/ownership';
import { QUEUE_ALERT_STEPS_MS, queueAlertAudience, queueWaitLabel } from '@/app/_shared/utils/alert-policy';
import { HUMAN_HOLD_MS } from '@/app/_shared/lib/whatsapp/ownership';
import { runSignatureReminders } from '@/app/_shared/lib/signature/core';

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
// degrau ultrapassado e para. Os degraus (10 min/1 h/4 h/24 h/48 h) e quem
// recebe cada um ficam em app/_shared/utils/alert-policy.ts
// (QUEUE_ALERT_STEPS_MS, queueAlertAudience).
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
// 18/08/2026: reduzido de 5 → 4 provocações (aviso de spam da Meta nas duas
// WABAs) — as 3 primeiras DENTRO da janela de 24h da Meta (texto livre, sem
// gastar template), a última pela despedida em template (recuperacao_triagem_
// final; o template 1 vira só fallback de janela fechada). O teto é POR
// NÚMERO desde 19/08/2026 (aviso de spam da Meta) — padrão e overrides moram
// em recovery-caps.ts, compartilhado com a pill do inbox.
const RECOVERY_EARLY_ATTEMPTS = 3;                // texto livre na janela de 24h

// Resolve o teto de provocações pelo número da conversa. Conversa sem
// numberId (linha legada) sai pelo número DEFAULT — herda o teto dele. O
// cache vive pela instância da lambda: o mapa é hardcoded e o vínculo
// id→phoneNumberId praticamente não muda.
let recoveryCapCache: { byNumberId: Map<string, number>; defaultCap: number } | null = null;
async function recoveryMaxAttempts(numberId: string | null): Promise<number> {
  if (!recoveryCapCache) {
    const rows = await db.whatsAppNumber.findMany({
      select: { id: true, phoneNumberId: true, isDefault: true },
    });
    const byNumberId = new Map<string, number>();
    let defaultCap = RECOVERY_MAX_ATTEMPTS_DEFAULT;
    for (const row of rows) {
      const cap = recoveryCapForPhoneNumberId(row.phoneNumberId);
      byNumberId.set(row.id, cap);
      if (row.isDefault) defaultCap = cap;
    }
    recoveryCapCache = { byNumberId, defaultCap };
  }
  return (numberId ? recoveryCapCache.byNumberId.get(numberId) : undefined) ?? recoveryCapCache.defaultCap;
}
// Cadência afrouxada (18/08/2026): 8h → 15h → 22h. Antes 4h/12h/20h — três
// cutucadas em menos de um dia liam como spam. As três continuam DENTRO da
// janela de 24h (fora dela virariam template MARKETING, pior pro sinal).
const RECOVERY_FIRST_AFTER_MS = 8 * 60 * 60_000;  // 1ª provocação: 8h após a última msg do cliente
const RECOVERY_EARLY_GAP_MS = 7 * 60 * 60_000;    // entre as provocações da janela (8h, 15h, 22h)
const RECOVERY_GAP_MS = 24 * 60 * 60_000;         // entre as tentativas por template
const RECOVERY_RETRY_MS = 6 * 60 * 60_000;        // re-tenta envios que falharam
const RECOVERY_TEMPLATE_1 = 'recuperacao_triagem_1';
const RECOVERY_TEMPLATE_FINAL = 'recuperacao_triagem_final';
// Teto DIÁRIO de provocações (18/08/2026): a régua de spam da Meta é o volume
// de proativas dos últimos dias — na semana do alerta saíam ~130/dia. O que
// passar do teto espera o dia seguinte (a conversa continua "due"). Ajustável
// sem deploy pela env WA_RECOVERY_DAILY_CAP.
const RECOVERY_DAILY_CAP = (() => {
  const raw = Number(process.env.WA_RECOVERY_DAILY_CAP);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 60;
})();

// Desfechos que NÃO são "sumiu no meio da triagem".
// 'nao_qualificado' entrou em 27/08/2026: o lead que a triagem DESCARTOU (já
// aposentado, já recebe benefício, sem cobertura...) estava caindo no ciclo de
// recuperação e sendo provocado de novo — exatamente quem já disse "não".
// Os desfechos "nq_*" (motivo detalhado da desqualificação) são cobertos pelo
// prefixo em standbyBlockReason, sem precisar listar um a um.
const NON_RECOVERABLE_CATEGORIES = new Set([
  'qualificado', 'contratado_perdido', 'perguntas', 'novo_acidente',
  'transferido', 'descartado', 'sem_resposta', 'nao_qualificado',
]);
const HUMAN_TOUCH_LOOKBACK_MS = 7 * 24 * 60 * 60_000;
// Lembretes/expiração da assinatura eletrônica — desligados em 14/09/2026.
const SIGNATURE_CRON_ENABLED = false;

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
  signatureReminders: number;
  /** Conversas órfãs (o bot não decidiu sobre a última mensagem) enviadas à Fila. */
  orphans: number;
}

function emptyResults(): CronResults {
  return { nudged30: 0, closed: 0, standby: 0, recoverySent: 0, queueAlerts: 0, deliveryAlerts: 0, overdueAlerts: 0, errors: 0, signatureReminders: 0, orphans: 0 };
}

/**
 * O ciclo de recuperação existe para UM caso: lead novo que sumiu no meio da
 * triagem. Devolve o motivo pelo qual esta conversa NÃO deve entrar (ou seguir)
 * no ciclo — null significa "pode provocar". (Caso Daniel, 06/08/2026.)
 */
async function standbyBlockReason(conv: {
  contactId: string;
  numberId: string | null;
  qualified: boolean | null;
  closeCategory: string | null;
  recoveryAttempts: number;
  contact: { optedOut: boolean; userId: string | null };
}): Promise<string | null> {
  if (conv.contact.optedOut) return 'contato em opt-out';
  if (conv.recoveryAttempts >= (await recoveryMaxAttempts(conv.numberId))) return 'ciclo de recuperação já esgotado';
  if (conv.qualified === true) return 'lead já qualificado';
  // Lead DESQUALIFICADO nunca entra (nem continua) no ciclo de recuperação.
  // A recuperação existe pra quem SUMIU no meio da triagem (qualified null);
  // insistir com quem já foi analisado e descartado — "já sou aposentado",
  // "já dei entrada", "já tenho advogado" — é o que mais gera denúncia de spam.
  if (conv.qualified === false) return 'lead desqualificado na triagem';
  if (conv.closeCategory?.startsWith('nq_')) {
    return `desfecho "${conv.closeCategory}" é desqualificação`;
  }
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

// Horário comercial (7h–21h de Brasília, todos os dias): isBrBusinessHour,
// nextBrBusinessSlot e brBusinessMinutesBetween vivem em date-br.ts — todo
// corte por hora passa por lá (a Vercel roda em UTC).
//
// Fecho do cliente ("ok, obrigada", reação, figurinha) e a classificação da
// última mensagem vivem em wa-silence.ts (puros, com teste).

// ---- ÓRFÃ e corrida com mensagem nova (fase nudge) ---------------------------
// Órfã = conversa em 'bot' cuja última mensagem é do cliente, pede resposta e
// NENHUMA decisão do cérebro foi registrada depois dela (erro de infra, função
// da Vercel morta no meio). O critério é "o bot não decidiu", nunca "o bot
// ficou calado": silent=true é decisão do cérebro e segue o fluxo normal. Vai
// para a Fila com o motivo (falha do bot → handoffToQueue), sem mensagem ao
// cliente. WA_ORPHAN_TO_QUEUE=0 desliga, se a Fila encher de falso positivo.
const ORPHAN_TO_QUEUE = isEnvSwitchOn(process.env.WA_ORPHAN_TO_QUEUE);

/** O cliente escreveu depois deste instante? */
async function inboundSince(contactId: string, since: Date): Promise<boolean> {
  const row = await db.whatsAppMessage.findFirst({
    where: { contactId, direction: 'in', deletedAt: null, createdAt: { gt: since } },
    select: { id: true },
  });
  return !!row;
}

/**
 * O cérebro registrou decisão (inclusive silêncio) depois deste instante? Todo
 * turno do bot que chega ao fim grava um log `wa_bot`; a busca usa o índice
 * (action, createdAt) de logs e filtra o contato no JSON (poucas linhas).
 */
async function botDecidedSince(contactId: string, since: Date): Promise<boolean> {
  const logs = await db.log.findMany({
    where: { action: 'wa_bot', createdAt: { gt: since }, metadata: { path: ['contactId'], equals: contactId } },
    select: { metadata: true },
    take: 10,
  });
  return logs.some((l) => isBotDecisionLog(l.metadata));
}

/**
 * Rede de segurança da órfã. `queued` = foi para a Fila; `left` = o cliente
 * escreveu de novo ou a conversa saiu do bot (não mexer: quem chegou decide);
 * `not_orphan` = o cérebro decidiu (ou o interruptor está desligado), segue o
 * fluxo do silêncio de sempre.
 */
async function sendOrphanToQueue(
  conv: { contactId: string; botState: string | null; contact: { name: string | null; phone: string } },
  lastInboundAt: Date,
  now: number,
): Promise<'queued' | 'left' | 'not_orphan'> {
  if (!ORPHAN_TO_QUEUE) return 'not_orphan';
  if (await botDecidedSince(conv.contactId, lastInboundAt)) return 'not_orphan';
  // Mensagem nova do cliente = a invocação do bot dela está rodando agora.
  if (await inboundSince(conv.contactId, lastInboundAt)) return 'left';
  const label = conv.contact.name ?? `+${conv.contact.phone}`;
  const reason = orphanReason(now - lastInboundAt.getTime());
  const moved = await handoffToQueue(conv.contactId, label, reason, 'transferido', { onlyIfStatus: 'bot' });
  if (!moved) return 'left';
  await recordCodeIntervention({
    contactId: conv.contactId,
    contactName: conv.contact.name,
    botState: conv.botState,
    action: 'orfa_para_fila',
    detail: `Conversa enviada à Fila pelo cron de silêncio: ${reason}; nenhuma decisão do bot registrada depois da mensagem.`,
  });
  return 'queued';
}

/**
 * Marca o silêncio de 30 min sem mandar nada. Condicional: se chegou ou saiu
 * qualquer mensagem desde a seleção (lastMessageAt mudou), a conversa não está
 * mais calada e fica para uma rodada futura.
 */
async function markSilenceSeen(conv: { id: string; lastMessageAt: Date }): Promise<void> {
  await db.whatsAppConversation.updateMany({
    where: { id: conv.id, status: 'bot', botNudge30At: null, lastMessageAt: conv.lastMessageAt },
    data: { botNudge30At: new Date() },
  });
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
 * Condição de entrada dos encerramentos do cron. `fromStatus` é o status em
 * que a conversa foi selecionada ('bot' na fase nudge, 'standby' na
 * recuperação). `botNudge30At` (quando informado) é o marcador visto na
 * seleção: a ingestão zera esse campo a cada mensagem do cliente, então a
 * igualdade no `where` detecta, no mesmo UPDATE, qualquer mensagem nova desde
 * a seleção — sem a janela entre uma leitura e a escrita (caso de 24/09
 * 13:00:02: pergunta enviada no mesmo segundo do cron, conversa encerrada sem
 * resposta).
 */
interface CloseGuard {
  fromStatus: 'bot' | 'standby';
  botNudge30At?: Date | null;
}

function guardWhere(conv: { id: string }, guard: CloseGuard) {
  return {
    id: conv.id,
    status: guard.fromStatus,
    ...(guard.botNudge30At !== undefined ? { botNudge30At: guard.botNudge30At } : {}),
  };
}

/**
 * Encerra a conversa por inatividade: snapshot pro cérebro + reset dos
 * marcadores. A ficha (botMemory/botState) é PRESERVADA (25/07/2026).
 * Devolve se encerrou: com o guard falhando (cliente escreveu, atendente
 * assumiu), a conversa fica como está.
 */
async function finalizeClose(
  conv: { id: string; contactId: string; qualified: boolean | null },
  opts: CloseGuard & { closeCategory?: string; recoveryOutcome?: string },
): Promise<boolean> {
  const where = guardWhere(conv, opts);
  // Releitura logo antes do snapshot: sem ela, conversa que não vai fechar
  // gera review na fila de revisão da IA.
  if (!(await db.whatsAppConversation.findFirst({ where, select: { id: true } }))) return false;
  await captureConversation(
    conv.contactId,
    'cron_silencio',
    opts.closeCategory ? { closeCategory: opts.closeCategory } : undefined,
  );
  const { count } = await db.whatsAppConversation.updateMany({
    where,
    data: {
      status: 'closed',
      closedAt: new Date(),
      assignedToId: null,
      botFailCount: 0,
      botNudge30At: null,
      botNudge24At: null,
      queuedAt: null,
      queueAlertAt: null,
      recoveryNextAt: null,
      ...(opts.closeCategory ? { closeCategory: opts.closeCategory } : {}),
      ...(opts.recoveryOutcome ? { recoveryOutcome: opts.recoveryOutcome } : {}),
    },
  });
  return count > 0;
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

/**
 * Entrada no STANDBY (ciclo de recuperação): agenda a 1ª provocação. Só sai
 * de 'bot', com o mesmo guard do encerramento; devolve se entrou.
 */
async function enterStandby(
  conv: { id: string; contactId: string },
  guard: { botNudge30At: Date | null },
): Promise<boolean> {
  const lastInbound = await db.whatsAppMessage.findFirst({
    where: { contactId: conv.contactId, direction: 'in', deletedAt: null },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const base = (lastInbound?.createdAt.getTime() ?? Date.now()) + RECOVERY_FIRST_AFTER_MS;
  const { count } = await db.whatsAppConversation.updateMany({
    where: guardWhere(conv, { fromStatus: 'bot', botNudge30At: guard.botNudge30At }),
    data: {
      status: 'standby',
      assignedToId: null,
      botFailCount: 0,
      botNudge30At: null,
      botNudge24At: null,
      queuedAt: null,
      queueAlertAt: null,
      recoveryNextAt: nextBrBusinessSlot(Math.max(base, Date.now() + 60_000)),
      recoveryOutcome: null,
    },
  });
  return count > 0;
}

// ---- ÚLTIMA FALA HUMANA (dono pegajoso, EF-1) --------------------------------
// Conversa em 'bot' cuja última fala não interna é de atendente (o atendente
// devolveu ao bot, ou escreveu e o cliente ainda não respondeu). Antes ela ia
// para standby/encerrada ~106 min depois da última mensagem dele, e o cliente
// que respondia no dia seguinte caía no bot sem contexto. Agora fica parada no
// 'bot' durante a janela do dono pegajoso (WA_HUMAN_HOLD_DAYS, 7 dias) e, depois
// dela, é encerrada direto, SEM standby: aos 7 dias a janela de 24 h da Meta
// fechou há muito, e a recuperação sairia pelo template MARKETING a contato
// frio (causa nº 1 do aviso de spam de 24/08). Aperta o anti-spam, não afrouxa.
//
// ARMADILHA: "parar" grava botNudge30At NO FUTURO (última fala humana + 7
// dias). O campo deixa de ser "quando o silêncio foi visto" e vira "quando
// reavaliar": a consulta do passo 2 (botNudge30At <= agora − 60 min) só volta
// a pegar a conversa depois da janela. Sem isso ela voltava em toda rodada e
// as 25 vagas da consulta enchiam de conversa parada (fome das outras). Só este
// cron lê o campo; a ingestão (mensagem do cliente) e o returnConversationToBot
// zeram o marcador, e o assumir tira a conversa do 'bot'. Leitor novo de
// botNudge30At precisa saber disso (ou virar coluna própria, com migration).
async function settleHumanLast(
  conv: {
    id: string;
    contactId: string;
    qualified: boolean | null;
    closeCategory: string | null;
    botState: string | null;
    botNudge30At: Date | null;
    contact: { name: string | null };
  },
  lastHumanAt: Date,
  now: number,
): Promise<'held' | 'closed' | 'changed' | 'legacy'> {
  const verdict = humanLastVerdict(lastHumanAt.getTime(), now, HUMAN_HOLD_MS);
  if (verdict.kind === 'legacy') return 'legacy';
  // Mesmo guard do encerramento: mensagem nova do cliente zera o marcador e o
  // UPDATE não pega; o bot da mensagem nova decide.
  const guard: CloseGuard = { fromStatus: 'bot', botNudge30At: conv.botNudge30At };
  if (verdict.kind === 'hold') {
    const { count } = await db.whatsAppConversation.updateMany({
      where: guardWhere(conv, guard),
      data: { botNudge30At: new Date(verdict.untilMs) },
    });
    return count > 0 ? 'held' : 'changed';
  }
  if (!(await finalizeClose(conv, { ...guard, closeCategory: silentCloseCategory(conv) }))) return 'changed';
  await recordCodeIntervention({
    contactId: conv.contactId,
    contactName: conv.contact.name,
    botState: conv.botState,
    action: 'recuperacao_bloqueada',
    detail:
      `Conversa encerrada sem entrar no ciclo de recuperação: última fala humana há mais de ${holdDaysLabel(HUMAN_HOLD_MS)} ` +
      '(a janela de 24 h da Meta já fechou; a provocação sairia por template MARKETING).',
  });
  return 'closed';
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
  maxAttempts: number,
): Promise<{ message: string; pending: string }> {
  const first = (contactName ?? '').trim().split(/\s+/)[0] ?? '';
  const oi = first ? `Oi, ${first}!` : 'Oi!';
  // 1ª = retomada leve; do meio = insistência; a ÚLTIMA é a despedida.
  const fallbackMessage =
    attempt >= maxAttempts
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
          maxAttempts,
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
// Só das 7h às 21h de Brasília (ver o começo da função).
// ---------------------------------------------------------------------------
export async function runNudgePhase(budgetMs?: number): Promise<CronResults> {
  const now = Date.now();
  const results = emptyResults();
  // Fora do horário comercial a fase inteira espera (cutucada, decisão da IA,
  // despedida e encerramentos silenciosos): 41% das despedidas "vou encerrar
  // seu atendimento" saíam à noite, e mensagem proativa de madrugada pesa na
  // qualidade da conta na Meta. Nada se perde — a conversa segue em 'bot' e a
  // primeira rodada a partir das 7h processa o acúmulo (ordenado abaixo).
  if (!isBrBusinessHour(now)) {
    console.log(`[WHATSAPP CRON] nudge adiado até ${nextBrBusinessSlot(now).toISOString()} (fora do horário)`);
    return results;
  }
  const pacer = createPacer(budgetMs);
  // Número desativado (somente leitura no inbox) fica fora de todos os crons.
  const onlyActive = await activeNumberConversationWhere();

  // ---- 1. Silêncio de 30 minutos ------------------------------------------
  // Mais antigas primeiro: às 7h o acúmulo da noite sai na ordem em que as
  // conversas ficaram caladas, no ritmo do marcapasso (take/gaps inalterados).
  const silent30 = await db.whatsAppConversation.findMany({
    where: {
      ...onlyActive,
      status: 'bot',
      botNudge30At: null,
      lastMessageAt: { lte: new Date(now - NUDGE_AFTER_MS) },
    },
    include: { contact: true },
    orderBy: { lastMessageAt: 'asc' },
    take: 25,
  });

  await timed(`nudge30 (${silent30.length} conversas)`, () => inSequence(silent30, async (conv) => {
    try {
      const last = await db.whatsAppMessage.findFirst({
        where: { contactId: conv.contactId, internal: false, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { direction: true, sentByBot: true, authorId: true, body: true, mediaType: true, createdAt: true },
      });
      const kind = classifyLastMessage(last);
      // Cliente perguntou e o bot não decidiu nada → Fila com o motivo.
      if (kind === 'client_pending' && last) {
        const orphan = await sendOrphanToQueue(conv, last.createdAt, now);
        if (orphan === 'queued') {
          results.orphans++;
          return;
        }
        if (orphan === 'left') return;
      }
      // Só cutuca se a ÚLTIMA mensagem foi do bot (pergunta sem resposta).
      // Fecho do cliente, atendente por último ou silêncio escolhido pelo
      // cérebro só ganham o marcador (e vão para standby/encerradas depois;
      // atendente por último fica parado no passo 2, ver settleHumanLast).
      if (!last || kind !== 'bot_asked') {
        await markSilenceSeen(conv);
        return;
      }
      // Janela de 24h fechada → texto livre seria recusado pela Meta (131047).
      if (!(await isWindowOpen(conv.contactId))) {
        await markSilenceSeen(conv);
        return;
      }
      // Daqui pra frente a conversa vai receber mensagem: pega uma vaga na
      // fila de envio. Sem vaga, fica intacta pra próxima rodada do cron.
      if (!(await pacer.slot())) return;
      const decision = await decideFollowup(conv.contactId, conv.contact.name, last.body);
      // Corrida com mensagem nova (BOT-5): a decisão da IA leva até 12 s e a
      // vaga do marcapasso mais alguns. Se o cliente escreveu nesse meio
      // tempo, o bot da mensagem nova responde; o cron sai sem mexer em nada.
      if (await inboundSince(conv.contactId, last.createdAt)) return;
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
        // Releitura antes de mudar o estado: o fecho suave acabou de sair e o
        // cliente pode ter respondido a ele.
        if (await inboundSince(conv.contactId, last.createdAt)) return;
        // Silêncio SEM desfecho real não pode virar "sem resposta" direto: é
        // lead que sumiu na triagem, tem que passar pelo ciclo de recuperação.
        // (13/08/2026 — caso Ambrosio, encerrado com 0 provocações.)
        if (!conv.closeCategory && !(await standbyBlockReason(conv))) {
          if (await enterStandby(conv, { botNudge30At: null })) results.standby++;
          return;
        }
        // Sem closeCategory a conversa caía na pasta "Não qualificadas" pelo
        // fallback do inbox — lead bom parecia desqualificado (11/08/2026).
        if (await finalizeClose(conv, {
          fromStatus: 'bot',
          botNudge30At: null,
          closeCategory: conv.closeCategory ?? 'sem_resposta',
        })) results.closed++;
        return;
      }
      await sendBotReply(conv.contactId, conv.contact.phone, conv.contact.name, decision.message || NUDGE_30MIN);
      results.nudged30++;
      // Cliente respondeu enquanto a cutucada saía: sem marcador, a conversa
      // segue viva com o bot (o marcador faria o encerramento de 60 min pegá-la).
      if (await inboundSince(conv.contactId, last.createdAt)) return;
      await db.whatsAppConversation.updateMany({
        where: { id: conv.id, status: 'bot', botNudge30At: null },
        data: { botNudge30At: new Date() },
      });
    } catch (err) {
      console.error('[WHATSAPP CRON] Falha no nudge 30min:', conv.contactId, err);
      results.errors++;
    }
  }));

  // ---- 2. Encerramento por inatividade -------------------------------------
  // Mesma ordem: quem foi cutucado primeiro se despede primeiro. Conversa com
  // a última fala de atendente dentro da janela do dono pegajoso é "parada"
  // (botNudge30At no futuro, ver settleHumanLast) e não volta aqui até vencer.
  let humanHeld = 0;
  const silentAfterNudge = await db.whatsAppConversation.findMany({
    where: {
      ...onlyActive,
      status: 'bot',
      botNudge30At: { not: null, lte: new Date(now - CLOSE_AFTER_MS) },
    },
    include: { contact: true },
    orderBy: { botNudge30At: 'asc' },
    take: 25,
  });

  await timed(`close (${silentAfterNudge.length} conversas)`, () => inSequence(silentAfterNudge, async (conv) => {
    try {
      const lastMsg = await db.whatsAppMessage.findFirst({
        where: { contactId: conv.contactId, internal: false, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { direction: true, sentByBot: true, authorId: true, body: true, mediaType: true, createdAt: true },
      });
      const kind = classifyLastMessage(lastMsg);
      // Mesma rede de segurança do passo 1 (marcador antigo ou interruptor
      // religado): pergunta do cliente sem decisão do bot vai para a Fila.
      if (kind === 'client_pending' && lastMsg) {
        const orphan = await sendOrphanToQueue(conv, lastMsg.createdAt, now);
        if (orphan === 'queued') {
          results.orphans++;
          return;
        }
        if (orphan === 'left') return;
      }
      // Última fala de atendente: parada no bot durante a janela do dono
      // pegajoso; depois dela, encerrada direto, sem standby (settleHumanLast).
      // Interruptor desligado ('legacy') segue o fluxo antigo abaixo.
      if (kind === 'human_last' && lastMsg) {
        const settled = await settleHumanLast(conv, lastMsg.createdAt, now);
        if (settled === 'held') {
          humanHeld++;
          return;
        }
        if (settled === 'closed') {
          results.closed++;
          return;
        }
        if (settled === 'changed') {
          console.log(`[WHATSAPP CRON] ${conv.contactId}: mudou durante a reavaliação (mensagem nova ou atendente) — nada feito.`);
          return;
        }
      }
      try {
        // Só se despede se a ÚLTIMA mensagem foi do PRÓPRIO BOT (caso Víctor).
        if (kind === 'bot_asked' && lastMsg && (await isWindowOpen(conv.contactId))) {
          // Sem vaga na fila de envio: adia a conversa inteira (a despedida
          // faz parte do encerramento, não pode sair "solta" depois).
          if (!(await pacer.slot())) return;
          const farewell = await buildFarewell(conv.contactId, conv.contact.name);
          // Releitura DEPOIS da IA da despedida (até 15 s) e logo antes do
          // envio: é a janela em que a pergunta do cliente cruzava com o
          // "vou encerrar seu atendimento" (BOT-5).
          if (await inboundSince(conv.contactId, lastMsg.createdAt)) return;
          await sendBotReply(conv.contactId, conv.contact.phone, conv.contact.name, farewell);
        }
      } catch (err) {
        console.error('[WHATSAPP CRON] Despedida não entregue (encerrando mesmo assim):', conv.contactId, err);
      }
      // Standby e encerramento só valem com o marcador visto na seleção: a
      // mensagem nova do cliente zera o botNudge30At (ingestão) e a conversa
      // fica com o bot, que responde.
      const guard = { botNudge30At: conv.botNudge30At };
      const block = await standbyBlockReason(conv);
      if (!block) {
        if (await enterStandby(conv, guard)) results.standby++;
        else console.log(`[WHATSAPP CRON] ${conv.contactId}: mudou durante o encerramento (mensagem nova ou atendente) — conversa não foi para standby.`);
      } else if (await finalizeClose(conv, { fromStatus: 'bot', ...guard, closeCategory: silentCloseCategory(conv) })) {
        await recordCodeIntervention({
          contactId: conv.contactId,
          contactName: conv.contact.name,
          botState: conv.botState,
          action: 'recuperacao_bloqueada',
          detail: `Conversa encerrada sem entrar no ciclo de recuperação: ${block}.`,
        });
        results.closed++;
      } else {
        console.log(`[WHATSAPP CRON] ${conv.contactId}: mudou durante o encerramento (mensagem nova ou atendente) — conversa não foi encerrada.`);
      }
    } catch (err) {
      console.error('[WHATSAPP CRON] Falha ao encerrar por inatividade:', conv.contactId, err);
      results.errors++;
    }
  }));

  if (pacer.skipped()) console.log(`[WHATSAPP CRON] nudge: ${pacer.skipped()} conversa(s) adiadas pra próxima rodada (fila de envio).`);
  console.log(
    `[WHATSAPP CRON] nudge: ${results.nudged30} cutucada(s), ${results.standby} standby, ${results.closed} encerrada(s), ` +
    `${results.orphans} órfã(s) para a Fila${ORPHAN_TO_QUEUE ? '' : ' (WA_ORPHAN_TO_QUEUE desligado)'}, ` +
    `${humanHeld} parada(s) com o atendente${HUMAN_HOLD_MS > 0 ? '' : ' (WA_HUMAN_HOLD_DAYS desligado)'}, ${results.errors} erro(s).`,
  );
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

  // Teto diário: conta o que já saiu HOJE (dia de Brasília) antes de disparar.
  // Estourou o teto → as conversas continuam "due" e saem amanhã; os desfechos
  // sem envio (opt-out/esgotado/bloqueado) continuam sendo processados.
  const sentToday = await db.whatsAppMessage.count({
    where: { direction: 'out', systemSource: 'recovery', createdAt: { gte: brStartOfDay() } },
  });
  let recoveryBudget = Math.max(0, RECOVERY_DAILY_CAP - sentToday);
  let cappedToday = 0;

  const onlyActive = await activeNumberConversationWhere();
  const dueRecovery = await db.whatsAppConversation.findMany({
    where: {
      ...onlyActive,
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
        if (await finalizeClose(conv, { fromStatus: 'standby', closeCategory: 'sem_resposta', recoveryOutcome: 'opt_out' })) results.closed++;
        return;
      }
      // Ciclo completo (teto do número da conversa) e mais 24h de silêncio →
      // não há o que fazer.
      const maxAttempts = await recoveryMaxAttempts(conv.numberId);
      if (conv.recoveryAttempts >= maxAttempts) {
        await recordRecoveryEvent({
          contactId: conv.contactId,
          contactName: conv.contact.name,
          botState: conv.botState,
          action: 'exhausted',
          attempt: conv.recoveryAttempts,
          detail: 'ciclo completo sem resposta do cliente',
        });
        if (await finalizeClose(conv, { fromStatus: 'standby', closeCategory: 'sem_resposta', recoveryOutcome: 'esgotado' })) results.closed++;
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
        if (await finalizeClose(conv, {
          fromStatus: 'standby',
          recoveryOutcome: 'bloqueado',
          closeCategory: silentCloseCategory(conv),
        })) results.closed++;
        return;
      }
      // Fora do horário comercial → adia.
      const slot = nextBrBusinessSlot(now);
      if (slot.getTime() > now) {
        await db.whatsAppConversation.update({ where: { id: conv.id }, data: { recoveryNextAt: slot } });
        return;
      }

      // Teto diário de provocações atingido → fica pra amanhã (a conversa
      // continua "due"; só os desfechos sem envio seguem sendo processados).
      if (recoveryBudget <= 0) {
        cappedToday++;
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
        maxAttempts,
      );
      const firstName = (conv.contact.name ?? '').trim().split(/\s+/)[0] || 'amigo(a)';
      const isFinal = attempt >= maxAttempts;
      // Só a ÚLTIMA usa o template final; as anteriores devem sair como texto
      // livre (janela de 24h aberta) — o template abaixo é só o fallback caso
      // a janela já tenha fechado.
      const useFinalTemplate = isFinal;
      const sent = await sendSystemWhatsApp({
        phone: conv.contact.phone,
        // Multi-número: o mesmo telefone pode existir como dois contatos (um
        // por linha). Resolver só pelo phone caía no gêmeo da outra linha e a
        // provocação saía pelo número errado — a conversa em standby é ESTA.
        contactId: conv.contactId,
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
          ? maxAttempts
          : sent.via === 'template'
            ? Math.max(attempt, maxAttempts - 1)
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
        // Num número de teto reduzido sobram menos tentativas de texto livre
        // (a última é sempre o template final, 24h depois).
        const earlyAttempts = Math.min(RECOVERY_EARLY_ATTEMPTS, maxAttempts - 1);
        const gapMs = attemptsAfter < earlyAttempts ? RECOVERY_EARLY_GAP_MS : RECOVERY_GAP_MS;
        await db.whatsAppConversation.update({
          where: { id: conv.id },
          data: {
            recoveryAttempts: attemptsAfter,
            recoveryNextAt: nextBrBusinessSlot(now + gapMs),
          },
        });
        results.recoverySent++;
        recoveryBudget--;
      } else if (sent.reason?.includes('não receber')) {
        await recordRecoveryEvent({
          contactId: conv.contactId,
          contactName: conv.contact.name,
          botState: conv.botState,
          action: 'opt_out',
          attempt: conv.recoveryAttempts,
          detail: sent.reason,
        });
        if (await finalizeClose(conv, { fromStatus: 'standby', closeCategory: 'sem_resposta', recoveryOutcome: 'opt_out' })) results.closed++;
      } else if (sent.reason?.includes('opt-in')) {
        await recordRecoveryEvent({
          contactId: conv.contactId,
          contactName: conv.contact.name,
          botState: conv.botState,
          action: 'exhausted',
          attempt: conv.recoveryAttempts,
          detail: sent.reason,
        });
        if (await finalizeClose(conv, { fromStatus: 'standby', closeCategory: 'sem_resposta', recoveryOutcome: 'esgotado' })) results.closed++;
      } else {
        // Cooldown, template não sincronizado, Meta rejeitou… → re-tenta em 6h.
        await db.whatsAppConversation.update({
          where: { id: conv.id },
          data: { recoveryNextAt: nextBrBusinessSlot(now + RECOVERY_RETRY_MS) },
        });
      }
    } catch (err) {
      console.error('[WHATSAPP CRON] Falha na provocação de recuperação:', conv.contactId, err);
      results.errors++;
    }
  }));

  if (pacer.skipped()) console.log(`[WHATSAPP CRON] recovery: ${pacer.skipped()} conversa(s) adiadas pra próxima rodada (fila de envio).`);
  if (cappedToday) console.log(`[WHATSAPP CRON] recovery: teto diário de ${RECOVERY_DAILY_CAP} provocações atingido — ${cappedToday} conversa(s) ficam pra amanhã.`);
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
  const onlyActive = await activeNumberConversationWhere();

  // ---- 3. SLA da fila de espera ---------------------------------------------
  await timed('sla-fila', async () => {
    const candidates = await db.whatsAppConversation.findMany({
      where: {
        ...onlyActive,
        status: 'queued',
        queuedAt: { not: null, lte: new Date(now - QUEUE_SLA_MS) },
      },
      include: { contact: true },
      take: 50,
    });
    // Um alerta por degrau (10min/1h/4h/24h/48h) por estadia na fila — quem já
    // foi alertado no degrau atual fica em silêncio até cruzar o próximo.
    const waitingTooLong = candidates
      .filter((conv) => dueAlertStep(QUEUE_ALERT_STEPS_MS, conv.queuedAt!.getTime(), now, conv.queueAlertAt) != null)
      .slice(0, 25);

    if (!waitingTooLong.length) return;

    for (const conv of waitingTooLong) {
      try {
        const label = conv.contact.name ?? `+${conv.contact.phone}`;
        const waitingMin = conv.queuedAt ? Math.round((now - conv.queuedAt.getTime()) / 60_000) : 0;
        const stepIdx = QUEUE_ALERT_STEPS_MS.filter((s) => conv.queuedAt!.getTime() + s <= now).length;
        const stepSuffix = ` (aviso ${stepIdx}/${QUEUE_ALERT_STEPS_MS.length}${stepIdx >= QUEUE_ALERT_STEPS_MS.length ? ' — último' : ''})`;
        // Por conversa (era a equipe toda em todos os degraus): 10 min vai ao
        // dono ou ao setor da Fila, 1 h ao dono + setor (sem dono, já a equipe),
        // 4 h e 24 h à equipe e 48 h aos gestores (antes o cron parava em 24 h).
        const audience = queueAlertAudience(stepIdx, !!conv.assignedToId);
        const recipients = await waAlertRecipients({
          contactId: conv.contactId,
          assignedToId: conv.assignedToId,
          // Sem atribuído = sem dono: a fila já gravou o dono pegajoso ao
          // entrar. Com atribuído, confere se ainda é da equipe.
          ownerId: conv.assignedToId ? undefined : null,
          audience,
        });
        const message = audience === 'managers'
          ? `⚠️ WhatsApp: ${label} está há ${queueWaitLabel(waitingMin)} na fila sem atendimento — aviso à gestão.${stepSuffix}`
          : `WhatsApp: ${label} está há ${queueWaitLabel(waitingMin)} na fila sem atendimento!${stepSuffix}`;

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
        console.error('[WHATSAPP CRON] Falha no alerta de fila:', conv.contactId, err);
        results.errors++;
      }
    }
  });

  // ---- 3b. SLA de atendimento HUMANO ----------------------------------------
  await timed('sla-humano', async () => {
    const stalledCandidates = isBrBusinessHour(now)
      ? await db.whatsAppConversation.findMany({
          where: {
            ...onlyActive,
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
          ? brBusinessMinutesBetween(conv.lastMessageAt.getTime(), now)
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

  // ---- 7. Assinatura eletrônica: lembretes, expiração e faxina ---------------
  // Vive na fase SLA de propósito: sem IA, termina em segundos, e o ciclo de
  // assinatura não pode esperar a fase de nudge (que tem orçamento de IA).
  await timed('sla-assinatura', async () => {
    // Assinatura eletrônica DESATIVADA (14/09/2026): os clientes não entendiam
    // o fluxo pelo site, o escritório voltou a colher pelo WhatsApp. Código
    // preservado; pra reativar, apagar este guard (e ligar SIGNATURE_AUTO_ENABLED).
    if (!SIGNATURE_CRON_ENABLED) return;
    try {
      const r = await runSignatureReminders(now);
      results.signatureReminders += r.reminders;
      results.errors += r.errors;
    } catch (err) {
      console.error('[WHATSAPP CRON] Falha no ciclo de lembretes de assinatura:', err);
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

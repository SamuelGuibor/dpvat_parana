// Agregação do painel "Desempenho do Chatbot" (getChatbotAnalytics).
//
// Até 25/09/2026 a action puxava TODOS os logs wa_* do período (~33 mil
// linhas, ~15 MB de metadata no mês) e contava num laço JS. Agora o Postgres
// agrupa e devolve dezenas de linhas; estas funções puras só dobram essas
// linhas no formato que a UI lê — com a MESMA régua do laço antigo, para os
// números não mudarem com a troca.

// ─── Decisões da IA (logs wa_bot) ───────────────────────────────────────────

/** Uma linha do GROUP BY outcome dos logs wa_bot do período. */
export interface BotOutcomeRow {
  /** metadata.outcome; log sem outcome conta como 'continue' (COALESCE no SQL). */
  outcome: string;
  n: number;
  /** metadata.intent === 'duvida'. */
  doubts: number;
  /** metadata.understood é boolean. */
  understoodTotal: number;
  /** metadata.understood === true. */
  understoodYes: number;
  /** Soma de metadata.confidence quando é número (0..1). */
  confSum: number;
  /** Quantas linhas tinham confidence numérico. */
  confN: number;
}

export interface BotAggregate {
  totalDecisions: number; // decisões da IA no período (fora erros)
  qualify: number;
  disqualify: number;
  handoff: number;
  /** Tudo o que não é qualify/disqualify/handoff/error (continue, resolve, send_flow...). */
  continueCount: number;
  error: number;
  doubts: number;
  understoodRate: number; // % (0..100) das decisões com understood boolean
  successRate: number;    // % de decisões sem erro
  avgConfidence: number;  // confiança média (0..100)
}

/**
 * Dobra as linhas agrupadas por outcome no bloco `bot` do painel.
 * Erro da IA só soma em `error`: não entra em decisões, dúvidas, entendimento
 * nem confiança (igual ao laço antigo).
 */
export function aggregateBotRows(rows: readonly BotOutcomeRow[]): BotAggregate {
  const bot: BotAggregate = {
    totalDecisions: 0, qualify: 0, disqualify: 0, handoff: 0, continueCount: 0,
    error: 0, doubts: 0, understoodRate: 0, successRate: 0, avgConfidence: 0,
  };
  let understoodTotal = 0;
  let understoodYes = 0;
  let confSum = 0;
  let confN = 0;

  for (const r of rows) {
    if (r.outcome === 'error') {
      bot.error += r.n;
      continue;
    }
    bot.totalDecisions += r.n;
    if (r.outcome === 'qualify') bot.qualify += r.n;
    else if (r.outcome === 'disqualify') bot.disqualify += r.n;
    else if (r.outcome === 'handoff') bot.handoff += r.n;
    else bot.continueCount += r.n;

    bot.doubts += r.doubts;
    understoodTotal += r.understoodTotal;
    understoodYes += r.understoodYes;
    confSum += r.confSum;
    confN += r.confN;
  }

  const withErrors = bot.totalDecisions + bot.error;
  bot.understoodRate = understoodTotal ? Math.round((understoodYes / understoodTotal) * 100) : 0;
  bot.successRate = withErrors ? Math.round((bot.totalDecisions / withErrors) * 100) : 0;
  bot.avgConfidence = confN ? Math.round((confSum / confN) * 100) : 0;
  return bot;
}

/**
 * Mediana (ms, vinda do percentile_cont) → minutos inteiros; null sem dados.
 * Mediana, não média: a idade da conversa (`conversationAgeMs`, antes
 * `durationMs`) conta desde a criação dela, e um contato que voltou no dia
 * seguinte arrastava a média (era o "1416 min").
 */
export function medianMsToMinutes(medianMs: number | null | undefined): number | null {
  return typeof medianMs === 'number' && Number.isFinite(medianMs) ? Math.round(medianMs / 60_000) : null;
}

// ─── Avisos automáticos ao cliente (logs wa_* com metadata.automated) ───────

export type AutoNotifyFailReason =
  | 'sem-opt-in' | 'cooldown' | 'sem-template' | 'opt-out' | 'meta-rejeitou' | 'outro';

/**
 * Trechos da mensagem dos logs ANTIGOS (antes do metadata.reason existir em
 * todos os casos). O SQL usa os mesmos textos (strpos) para agrupar, então
 * mudar aqui muda nos dois lados.
 */
export const AUTO_NOTIFY_FAIL_HINTS = {
  optIn: 'sem opt-in',
  cooldown: 'intervalo mínimo',
  noTemplate: 'nenhum template',
} as const;

export interface FailMessageHints {
  optIn: boolean;
  cooldown: boolean;
  noTemplate: boolean;
}

export function failMessageHints(message: string): FailMessageHints {
  return {
    optIn: message.includes(AUTO_NOTIFY_FAIL_HINTS.optIn),
    cooldown: message.includes(AUTO_NOTIFY_FAIL_HINTS.cooldown),
    noTemplate: message.includes(AUTO_NOTIFY_FAIL_HINTS.noTemplate),
  };
}

function failReasonFrom(reason: string | null, hints: FailMessageHints): AutoNotifyFailReason {
  const raw = reason ?? '';
  if (raw === 'sem opt-in') return 'sem-opt-in';
  if (raw === 'cooldown') return 'cooldown';
  if (raw === 'sem template') return 'sem-template';
  if (raw === 'opt-out') return 'opt-out';
  if (raw === 'meta rejeitou') return 'meta-rejeitou';
  if (hints.optIn) return 'sem-opt-in';
  if (hints.cooldown) return 'cooldown';
  if (hints.noTemplate) return 'sem-template';
  return 'outro';
}

/**
 * Motivo normalizado de uma falha de aviso automático: logs novos têm
 * metadata.reason; os antigos caem no texto da mensagem.
 */
export function normalizeAutoNotifyFailReason(reason: string | null, message: string): AutoNotifyFailReason {
  return failReasonFrom(reason, failMessageHints(message));
}

/**
 * Uma linha do GROUP BY dos avisos automáticos. `kind` segue a precedência do
 * laço antigo: silêncio (unansweredCount numérico) > falha (skipped=true) >
 * entregue. reason/optIn/cooldown/noTemplate só vêm preenchidos em 'failed'.
 */
export interface AutoNotifyRow {
  kind: 'silence' | 'failed' | 'sent';
  reason: string | null;
  optIn: boolean | null;
  cooldown: boolean | null;
  noTemplate: boolean | null;
  n: number;
}

export interface AutoNotifyTotals {
  sent: number;
  failed: number;
  silenceAlerts: number;
  byReason: Record<string, number>;
}

export function foldAutoNotifyRows(rows: readonly AutoNotifyRow[]): AutoNotifyTotals {
  const out: AutoNotifyTotals = { sent: 0, failed: 0, silenceAlerts: 0, byReason: {} };
  for (const r of rows) {
    if (r.kind === 'silence') {
      out.silenceAlerts += r.n;
    } else if (r.kind === 'failed') {
      out.failed += r.n;
      const key = failReasonFrom(r.reason, {
        optIn: r.optIn === true, cooldown: r.cooldown === true, noTemplate: r.noTemplate === true,
      });
      out.byReason[key] = (out.byReason[key] ?? 0) + r.n;
    } else {
      out.sent += r.n;
    }
  }
  return out;
}

/** Gravidade do aviso da Meta (log wa_account); valor desconhecido = 'info'. */
export function accountEventSeverity(raw: string | null | undefined): 'critical' | 'warning' | 'ok' | 'info' {
  return raw === 'critical' || raw === 'warning' || raw === 'ok' ? raw : 'info';
}

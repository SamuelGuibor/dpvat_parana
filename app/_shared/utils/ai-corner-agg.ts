// Agregação do Canto da IA (getAiCorner).
//
// Até 25/09/2026 a action puxava TODO log com metadata.usage do período
// (~22 mil linhas / ~9,5 MB de metadata por abertura) só para somar tokens em
// JS. Agora o Postgres agrupa por ação × modelo × hora (UTC) e estas funções
// puras montam o extrato a partir dos grupos.
//
// Desde 01/10/2026 o extrato segue o PERÍODO do painel do chatbot (calendário
// do dashboard ou atalho 7/30/90 dias), não mais "mês corrente × 30 dias"
// fixos: no dia 1º o "mês" tinha um dia, a projeção multiplicava esse dia por
// 31 e nada batia com o resto da tela.
//
// Por que somar por grupo dá o MESMO número que somar chamada a chamada:
//   - o preço é linear nos tokens (usageCostUSD), então o custo da soma é a
//     soma dos custos dentro do mesmo modelo — por isso o modelo está no
//     GROUP BY (e o modelo nulo vira um grupo próprio, "estimado");
//   - o fuso de Brasília tem offset em horas cheias: a meia-noite BRT que abre
//     e fecha o período cai sempre em hora cheia UTC, e a hora inteira pertence
//     ao mesmo dia de Brasília. Por isso o SQL agrupa por hora UTC e o corte de
//     dia fica no brDayKey(hour) — nunca no SQL, porque a Vercel roda em UTC.

import { modelLabel, priceFor, usageCostUSD, usageTokens } from '@/app/_shared/lib/ai-pricing';
import {
  brDayKey, brDaysInMonth, brLabelFromKey, brStartOfDay, brStartOfDaysAgo,
} from '@/app/_shared/utils/date-br';

export interface AiOperation {
  action: string;
  label: string;
  icon: string;
  runs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  tokens: number;
  usd: number;
  models: string[];
  /** Alguma chamada usou modelo fora da tabela de preços (custo estimado). */
  estimated: boolean;
}

export interface AiWindow {
  fromISO: string;
  toISO: string;
  usd: number;
  tokens: number;
  runs: number;
  operations: AiOperation[];
}

export interface AiCorner extends AiWindow {
  /** Dias de Brasília do período (até hoje, se o período avança no futuro). */
  days: number;
  /** Média por dia no período e quanto um mês sairia nesse ritmo. */
  avgDailyUSD: number;
  monthPaceUSD: number;
  /** Sempre o dia corrente, mesmo fora do período. */
  today: { usd: number; tokens: number; runs: number };
  /** Custo do wa_bot ÷ decisões do wa_bot no período. */
  costPerBotDecision: number | null;
  /** Série por dia (até 62 dias) ou por mês (períodos maiores). */
  series: { key: string; label: string; usd: number }[];
  seriesUnit: 'dia' | 'mês';
  /** Filtro por número ativo (só entram chamadas ligadas a um contato do número). */
  numberFiltered: boolean;
}

/**
 * Uma linha do GROUP BY (ação × modelo × hora UTC) dos logs com
 * metadata.usage. Tokens que não são número no JSON entram como 0.
 */
export interface AiUsageGroup {
  action: string;
  /** metadata.usage.model; null quando o log não diz o modelo. */
  model: string | null;
  /** Início da hora UTC do grupo (date_trunc('hour', createdAt)). */
  hour: Date;
  runs: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/** Rótulo e ícone por operação (vivem na action; ação sem entrada usa a chave). */
export interface AiOperationNames {
  labels: Record<string, string>;
  icons: Record<string, string>;
}

export interface AiPeriodBounds {
  from: Date;
  to: Date;
  todayStart: Date;
  /** Intervalo que a query precisa ler: período ∪ hoje. */
  since: Date;
  until: Date;
}

/**
 * Limites do período. Sem `fromISO`, vale `days` (padrão 30) terminando hoje,
 * com início à meia-noite de Brasília.
 */
export function aiPeriodBounds(
  opts: { fromISO?: string; toISO?: string; days?: number },
  now: Date = new Date(),
): AiPeriodBounds {
  const from = opts.fromISO ? new Date(opts.fromISO) : brStartOfDaysAgo(Math.max(opts.days ?? 30, 1) - 1, now);
  const to = opts.toISO ? new Date(opts.toISO) : now;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    throw new Error('Período inválido.');
  }
  const todayStart = brStartOfDay(now);
  return {
    from,
    to,
    todayStart,
    since: from < todayStart ? from : todayStart,
    until: to > now ? to : now,
  };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function emptyOp(action: string, names: AiOperationNames): AiOperation {
  return {
    action,
    label: names.labels[action] ?? action,
    icon: names.icons[action] ?? 'sparkles',
    runs: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
    tokens: 0, usd: 0, models: [], estimated: false,
  };
}

/**
 * Agrega os grupos de [from, to] por operação. A ordem dos grupos importa só
 * para desempate (ordem dos modelos na lista e das operações de mesmo custo):
 * a query ordena por min(createdAt).
 */
export function buildAiWindow(
  from: Date,
  to: Date,
  groups: AiUsageGroup[],
  names: AiOperationNames,
): AiWindow {
  const ops = new Map<string, AiOperation>();
  let usd = 0;
  let tokens = 0;
  let runs = 0;

  for (const g of groups) {
    // Hora cheia UTC >= meia-noite BRT (também hora cheia) ⇔ toda chamada do
    // grupo está dentro do período; idem no fim (23:59:59 BRT fecha a hora).
    if (g.hour < from || g.hour > to) continue;
    const op = ops.get(g.action) ?? emptyOp(g.action, names);
    const cost = usageCostUSD(g);
    const tok = usageTokens(g);

    op.runs += g.runs;
    op.usd += cost;
    op.tokens += tok;
    op.inputTokens += g.inputTokens;
    op.outputTokens += g.outputTokens;
    op.cacheReadTokens += g.cacheReadTokens;
    op.cacheWriteTokens += g.cacheWriteTokens;
    const m = modelLabel(g.model);
    if (g.model && !op.models.includes(m)) op.models.push(m);
    if (!priceFor(g.model).known) op.estimated = true;
    ops.set(g.action, op);

    usd += cost;
    tokens += tok;
    runs += g.runs;
  }

  const operations = [...ops.values()]
    .map((o) => ({ ...o, usd: round4(o.usd) }))
    .sort((a, b) => b.usd - a.usd);

  return {
    fromISO: from.toISOString(),
    toISO: to.toISOString(),
    usd: round4(usd),
    tokens,
    runs,
    operations,
  };
}

/**
 * Monta o extrato do período (operações, série, média, ritmo de um mês, hoje
 * e custo por decisão do bot) a partir dos grupos por hora. `now` é o mesmo
 * instante usado em aiPeriodBounds.
 */
export function buildAiCorner(
  groups: AiUsageGroup[],
  names: AiOperationNames,
  bounds: AiPeriodBounds,
  now: Date = new Date(),
  numberFiltered = false,
): AiCorner {
  const { from, to, todayStart } = bounds;
  const window = buildAiWindow(from, to, groups, names);
  const todayWindow = buildAiWindow(todayStart, now, groups, names);

  // Dias de Brasília do período (o pedaço no futuro não conta na média).
  const lastDay = brStartOfDay(to > now ? now : to);
  const firstDay = brStartOfDay(from);
  const days = Math.max(1, Math.round((lastDay.getTime() - firstDay.getTime()) / 86_400_000) + 1);

  // Série: buckets vazios entram zerados, senão o gráfico mente. Pula 36 h e
  // re-ancora na meia-noite de Brasília — nunca repete nem pula um dia.
  // A unidade olha o período INTEIRO (01/08–31/10 é "por mês" mesmo no dia 1/10).
  const spanDays = Math.round((brStartOfDay(to).getTime() - firstDay.getTime()) / 86_400_000) + 1;
  const seriesUnit: 'dia' | 'mês' = spanDays <= 62 ? 'dia' : 'mês';
  const bucketOf = (d: Date) => (seriesUnit === 'dia' ? brDayKey(d) : brDayKey(d).slice(0, 7));
  const buckets = new Map<string, number>();
  for (let d = firstDay; d <= lastDay; d = brStartOfDay(new Date(d.getTime() + 36 * 3_600_000))) {
    buckets.set(bucketOf(d), 0);
  }
  for (const g of groups) {
    if (g.hour < from || g.hour > to) continue;
    const key = bucketOf(g.hour);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + usageCostUSD(g));
  }
  const series = [...buckets.entries()].map(([key, value]) => ({
    key,
    label: seriesUnit === 'dia' ? brLabelFromKey(key) : `${MONTHS[Number(key.slice(5, 7)) - 1]}/${key.slice(2, 4)}`,
    usd: round4(value),
  }));

  // Custo por decisão = só o wa_bot. Antes dividia o gasto de TODA a IA
  // (roteiro, ficha, auditoria…) pelas decisões e saía ~35% alto. As respostas
  // descartadas ficam fora de propósito (wa_bot_discarded é linha própria).
  const bot = window.operations.find((o) => o.action === 'wa_bot');
  const costPerBotDecision = bot && bot.runs > 0 ? round4(bot.usd / bot.runs) : null;

  const avgDailyUSD = window.usd / days;
  return {
    ...window,
    days,
    avgDailyUSD: round4(avgDailyUSD),
    monthPaceUSD: Math.round(avgDailyUSD * brDaysInMonth(now) * 100) / 100,
    today: { usd: todayWindow.usd, tokens: todayWindow.tokens, runs: todayWindow.runs },
    costPerBotDecision,
    series,
    seriesUnit,
    numberFiltered,
  };
}

// Agregação do Canto da IA (getAiCorner).
//
// Até 25/09/2026 a action puxava TODO log com metadata.usage do período
// (~22 mil linhas / ~9,5 MB de metadata por abertura) só para somar tokens em
// JS. Agora o Postgres agrupa por ação × modelo × hora (UTC) — ~1,5 mil grupos
// num mês — e estas funções puras montam as janelas a partir dos grupos.
//
// Por que somar por grupo dá o MESMO número que somar chamada a chamada:
//   - o preço é linear nos tokens (usageCostUSD), então o custo da soma é a
//     soma dos custos dentro do mesmo modelo — por isso o modelo está no
//     GROUP BY (e o modelo nulo vira um grupo próprio, "estimado");
//   - o fuso de Brasília tem offset em horas cheias: a meia-noite BRT que abre
//     as janelas mês / 30 dias / hoje cai sempre em hora cheia UTC, e a hora
//     inteira pertence ao mesmo dia de Brasília. Por isso o SQL agrupa por
//     hora UTC e o corte de dia fica no brDayKey(hour) — nunca no SQL, porque
//     a Vercel roda em UTC.

import { modelLabel, priceFor, usageCostUSD, usageTokens } from '@/app/_shared/lib/ai-pricing';
import {
  brDayKey, brDayKeySeries, brDaysInMonth, brDayOfMonth, brLabelFromKey,
  brStartOfDay, brStartOfDaysAgo, brStartOfMonth,
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
  label: string;
  fromISO: string;
  usd: number;
  tokens: number;
  runs: number;
  operations: AiOperation[];
}

export interface AiCorner {
  /** Mês corrente (1º → agora, fuso de Brasília) — comparável ao console. */
  month: AiWindow;
  /** Últimos 30 dias corridos. */
  last30: AiWindow;
  today: { usd: number; tokens: number; runs: number };
  /** Projeção de fechamento do mês, pelo ritmo médio diário até aqui. */
  monthProjectionUSD: number;
  /** Custo médio por decisão do bot no mês (o que a operação custa por lead). */
  costPerBotDecision: number | null;
  /** Série diária do mês corrente, para o gráfico. */
  daily: { date: string; label: string; usd: number }[];
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

/** Limites das janelas do Canto da IA no instante `now` (meia-noite BRT). */
export interface AiCornerBounds {
  monthStart: Date;
  last30Start: Date;
  todayStart: Date;
  /** Menor dos inícios: é daqui que a query precisa ler. */
  since: Date;
}

export function aiCornerBounds(now: Date = new Date()): AiCornerBounds {
  const monthStart = brStartOfMonth(now);
  const last30Start = brStartOfDaysAgo(29, now);
  const todayStart = brStartOfDay(now);
  const since = monthStart < last30Start ? monthStart : last30Start;
  return { monthStart, last30Start, todayStart, since };
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

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
 * Agrega os grupos de uma janela por operação. A ordem dos grupos importa só
 * para desempate (ordem dos modelos na lista e das operações de mesmo custo):
 * a query ordena por min(createdAt), que reproduz a ordem do laço antigo.
 */
export function buildAiWindow(
  label: string,
  from: Date,
  groups: AiUsageGroup[],
  names: AiOperationNames,
): AiWindow {
  const ops = new Map<string, AiOperation>();
  let usd = 0;
  let tokens = 0;
  let runs = 0;

  for (const g of groups) {
    // Hora cheia UTC >= meia-noite BRT (também hora cheia) ⇔ toda chamada do
    // grupo está dentro da janela.
    if (g.hour < from) continue;
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
    label,
    fromISO: from.toISOString(),
    usd: round4(usd),
    tokens,
    runs,
    operations,
  };
}

/**
 * Monta o extrato inteiro (mês, 30 dias, hoje, série diária, projeção e custo
 * por decisão do bot) a partir dos grupos por hora. `now` é o mesmo instante
 * usado para calcular o `since` da query (aiCornerBounds).
 */
export function buildAiWindowsFromGroups(
  groups: AiUsageGroup[],
  names: AiOperationNames,
  now: Date = new Date(),
): AiCorner {
  const { monthStart, last30Start, todayStart } = aiCornerBounds(now);

  const month = buildAiWindow('Mês corrente', monthStart, groups, names);
  const last30 = buildAiWindow('Últimos 30 dias', last30Start, groups, names);
  const todayWindow = buildAiWindow('Hoje', todayStart, groups, names);

  // Série diária do mês (dias sem gasto entram zerados, senão o gráfico mente).
  const daysElapsed = brDayOfMonth(now);
  const dailyMap = new Map<string, number>();
  for (const key of brDayKeySeries(daysElapsed, now)) dailyMap.set(key, 0);
  for (const g of groups) {
    if (g.hour < monthStart) continue;
    const key = brDayKey(g.hour);
    if (dailyMap.has(key)) dailyMap.set(key, (dailyMap.get(key) ?? 0) + usageCostUSD(g));
  }
  const daily = [...dailyMap.entries()].map(([date, value]) => ({
    date,
    label: brLabelFromKey(date),
    usd: round4(value),
  }));

  // Projeção: ritmo médio diário do mês × dias do mês. O dia corrente conta
  // como dia inteiro — projeção de manhã fica otimista, e está tudo bem.
  const daysInMonth = brDaysInMonth(now);
  const monthProjectionUSD = daysElapsed > 0
    ? Math.round((month.usd / daysElapsed) * daysInMonth * 100) / 100
    : 0;

  const botDecisions = month.operations.find((o) => o.action === 'wa_bot')?.runs ?? 0;
  const costPerBotDecision = botDecisions > 0 ? round4(month.usd / botDecisions) : null;

  return {
    month,
    last30,
    today: { usd: todayWindow.usd, tokens: todayWindow.tokens, runs: todayWindow.runs },
    monthProjectionUSD,
    costPerBotDecision,
    daily,
  };
}

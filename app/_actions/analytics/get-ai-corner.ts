'use server';

import { db } from '@/app/_shared/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { canViewChatbotDashboard } from '@/app/_shared/lib/chatbot-access';
import { modelLabel, priceFor, usageCostUSD, usageTokens } from '@/app/_shared/lib/ai-pricing';
import {
  brDayKey, brDayKeySeries, brDaysInMonth, brDayOfMonth, brLabelFromKey,
  brStartOfDay, brStartOfDaysAgo, brStartOfMonth,
} from '@/app/_shared/utils/date-br';

// Canto da IA: o extrato de consumo da inteligência artificial no CRM.
//
// Regra de ouro: NADA de lista fixa de ações. Todo log que gravar
// `metadata.usage` entra na conta automaticamente — foi assim que a ficha
// automática e a auditoria de documentos ficaram de fora do painel antigo,
// que só somava wa_bot, wa_suggest e wa_summary.
//
// Duas janelas SEMPRE lado a lado, porque elas divergem e é isso que confunde
// na hora de comparar com o console da Anthropic:
//   - mês corrente (1º do mês, fuso de Brasília) — é o que o console mostra;
//   - últimos 30 dias corridos — é o que o painel antigo chamava de "mês".

/** Rótulo de cada operação. Ação sem rótulo aqui aparece com a própria chave. */
const OPERATION_LABELS: Record<string, string> = {
  wa_bot: 'Bot do WhatsApp',
  wa_suggest: 'Sugestão de resposta',
  wa_summary: 'Resumo da conversa',
  wa_ficha_ai: 'Ficha automática',
  ai_audit: 'Auditoria de documentos',
  roteiro_ai: 'Roteiro (IA)',
};

/** Ícone (chave lucide resolvida na UI) por operação. */
const OPERATION_ICONS: Record<string, string> = {
  wa_bot: 'bot',
  wa_suggest: 'message',
  wa_summary: 'file',
  wa_ficha_ai: 'id',
  ai_audit: 'shield',
  roteiro_ai: 'scroll',
};

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

type UsageRow = { action: string; createdAt: Date; usage: Record<string, unknown> };

function emptyOp(action: string): AiOperation {
  return {
    action,
    label: OPERATION_LABELS[action] ?? action,
    icon: OPERATION_ICONS[action] ?? 'sparkles',
    runs: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
    tokens: 0, usd: 0, models: [], estimated: false,
  };
}

/** Agrega as chamadas de uma janela por operação. */
function buildWindow(label: string, from: Date, rows: UsageRow[]): AiWindow {
  const ops = new Map<string, AiOperation>();
  let usd = 0;
  let tokens = 0;
  let runs = 0;

  for (const row of rows) {
    if (row.createdAt < from) continue;
    const u = row.usage as {
      model?: string; inputTokens?: number; outputTokens?: number;
      cacheReadTokens?: number; cacheWriteTokens?: number;
    };
    const op = ops.get(row.action) ?? emptyOp(row.action);
    const cost = usageCostUSD(u);
    const tok = usageTokens(u);

    op.runs += 1;
    op.usd += cost;
    op.tokens += tok;
    op.inputTokens += u.inputTokens ?? 0;
    op.outputTokens += u.outputTokens ?? 0;
    op.cacheReadTokens += u.cacheReadTokens ?? 0;
    op.cacheWriteTokens += u.cacheWriteTokens ?? 0;
    const m = modelLabel(u.model);
    if (u.model && !op.models.includes(m)) op.models.push(m);
    if (!priceFor(u.model).known) op.estimated = true;
    ops.set(row.action, op);

    usd += cost;
    tokens += tok;
    runs += 1;
  }

  const operations = [...ops.values()]
    .map((o) => ({ ...o, usd: Math.round(o.usd * 10000) / 10000 }))
    .sort((a, b) => b.usd - a.usd);

  return {
    label,
    fromISO: from.toISOString(),
    usd: Math.round(usd * 10000) / 10000,
    tokens,
    runs,
    operations,
  };
}

/**
 * Extrato completo do consumo de IA. Restrito a quem enxerga o dashboard do
 * chatbot (mesma trava do painel de desempenho).
 */
export async function getAiCorner(): Promise<AiCorner> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Não autenticado.');
  if (!canViewChatbotDashboard(session.user.email)) {
    throw new Error('Acesso restrito: você não está autorizado a ver o Canto da IA.');
  }

  const monthStart = brStartOfMonth();
  const last30Start = brStartOfDaysAgo(29);
  const todayStart = brStartOfDay();
  const since = monthStart < last30Start ? monthStart : last30Start;

  // jsonb_exists em vez de lista de ações: qualquer log que grave usage entra.
  const raw = await db.$queryRaw<{ action: string; createdAt: Date; metadata: unknown }[]>`
    SELECT action, "createdAt", metadata
    FROM logs
    WHERE "createdAt" >= ${since}
      AND metadata IS NOT NULL
      AND jsonb_exists(metadata, 'usage')
    ORDER BY "createdAt" ASC
  `;

  const rows: UsageRow[] = raw
    .map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const usage = meta.usage as Record<string, unknown> | undefined;
      return usage ? { action: r.action, createdAt: r.createdAt, usage } : null;
    })
    .filter((r): r is UsageRow => !!r);

  const month = buildWindow('Mês corrente', monthStart, rows);
  const last30 = buildWindow('Últimos 30 dias', last30Start, rows);
  const todayWindow = buildWindow('Hoje', todayStart, rows);

  // Série diária do mês (dias sem gasto entram zerados, senão o gráfico mente).
  const daysElapsed = brDayOfMonth();
  const dailyMap = new Map<string, number>();
  for (const key of brDayKeySeries(daysElapsed)) dailyMap.set(key, 0);
  for (const row of rows) {
    if (row.createdAt < monthStart) continue;
    const key = brDayKey(row.createdAt);
    if (dailyMap.has(key)) dailyMap.set(key, (dailyMap.get(key) ?? 0) + usageCostUSD(row.usage));
  }
  const daily = [...dailyMap.entries()].map(([date, value]) => ({
    date,
    label: brLabelFromKey(date),
    usd: Math.round(value * 10000) / 10000,
  }));

  // Projeção: ritmo médio diário do mês × dias do mês. O dia corrente conta
  // como dia inteiro — projeção de manhã fica otimista, e está tudo bem.
  const daysInMonth = brDaysInMonth();
  const monthProjectionUSD = daysElapsed > 0
    ? Math.round((month.usd / daysElapsed) * daysInMonth * 100) / 100
    : 0;

  const botDecisions = month.operations.find((o) => o.action === 'wa_bot')?.runs ?? 0;
  const costPerBotDecision = botDecisions > 0
    ? Math.round((month.usd / botDecisions) * 10000) / 10000
    : null;

  return {
    month,
    last30,
    today: { usd: todayWindow.usd, tokens: todayWindow.tokens, runs: todayWindow.runs },
    monthProjectionUSD,
    costPerBotDecision,
    daily,
  };
}

'use server';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from '@/app/_shared/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { canViewChatbotDashboard } from '@/app/_shared/lib/chatbot-access';

// Métricas do chatbot para o dashboard (abaixo da Visão do Gestor). Deriva
// tudo dos logs de WhatsApp (action começando com "wa_"):
//   - wa_bot: decisões da IA (qualify/disqualify/handoff/continue/erro), com
//     intent, understood, confidence e durationMs no metadata.
//   - demais wa_*: ações dos atendentes (atribuir, enviar doc/fluxo/texto...).

export interface ChatbotActivityItem {
  id: string;
  at: string;
  authorName: string;
  action: string;
  message: string;
  contactName: string | null;
}

export interface ChatbotAnalytics {
  periodDays: number;
  bot: {
    totalDecisions: number;      // decisões da IA no período (fora erros)
    qualify: number;             // qualificados
    disqualify: number;          // não qualificados
    handoff: number;             // transferidos para humano
    continueCount: number;       // seguiu a conversa
    error: number;               // erros da IA
    doubts: number;              // mensagens com intenção "dúvida"
    understoodRate: number;      // % de mensagens entendidas (0..100)
    successRate: number;         // % de decisões sem erro (acertos)
    avgConfidence: number;       // confiança média (0..100)
    avgQualifyMinutes: number | null; // tempo médio até qualificar
    intents: Record<string, number>;
    emotions: Record<string, number>;
  };
  // Gasto estimado com a API do Claude (USD), derivado dos tokens gravados
  // no metadata.usage dos logs wa_bot. Sempre semanal e mensal, independente
  // do filtro de período.
  cost: {
    weekUSD: number;
    monthUSD: number;
    weekTokens: number;
    monthTokens: number;
    model: string | null;
  };
  // Como os assuntos foram encerrados no período (perguntas, qualificado, etc.).
  closeCategories: Record<string, number>;
  activity: ChatbotActivityItem[];
}

// Preço por 1M de tokens (USD) — tabela oficial da Anthropic (jun/2026).
// Cache read ≈ 0,1× do input; cache write ≈ 1,25× do input.
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-fable-5': { input: 10, output: 50 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-opus-4-5': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

function usageCostUSD(u: {
  model?: string; inputTokens?: number; outputTokens?: number;
  cacheReadTokens?: number; cacheWriteTokens?: number;
}): number {
  const key = Object.keys(MODEL_PRICING).find((k) => (u.model ?? '').startsWith(k));
  const price = key ? MODEL_PRICING[key] : MODEL_PRICING['claude-opus-4-8'];
  const inTok = u.inputTokens ?? 0;
  const outTok = u.outputTokens ?? 0;
  const cacheRead = u.cacheReadTokens ?? 0;
  const cacheWrite = u.cacheWriteTokens ?? 0;
  return (
    (inTok * price.input +
      outTok * price.output +
      cacheRead * price.input * 0.1 +
      cacheWrite * price.input * 1.25) / 1_000_000
  );
}

const INTENT_LABELS: Record<string, string> = {
  novo_lead: 'Novo lead', cliente_existente: 'Cliente existente', duvida: 'Dúvida',
  financeiro: 'Financeiro', suporte: 'Suporte', documentos: 'Documentos',
  reclamacao: 'Reclamação', outro: 'Outro',
};

/** A UI usa isto pra decidir se mostra a seção "Desempenho do Chatbot". */
export async function getChatbotDashboardAccess(): Promise<boolean> {
  const session = await getServerSession(authOptions);
  return !!session?.user?.id && canViewChatbotDashboard(session.user.email);
}

export async function getChatbotAnalytics(periodDays: 7 | 30 | 90 = 7): Promise<ChatbotAnalytics> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Não autenticado.');
  if (!canViewChatbotDashboard(session.user.email)) {
    throw new Error('Acesso restrito: você não está autorizado a ver o Desempenho do Chatbot.');
  }

  const since = new Date();
  since.setDate(since.getDate() - (periodDays - 1));
  since.setHours(0, 0, 0, 0);

  // Janelas fixas para o gasto com a API (independentes do filtro).
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 6); weekAgo.setHours(0, 0, 0, 0);
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate() - 29); monthAgo.setHours(0, 0, 0, 0);
  const costSince = since < monthAgo ? since : monthAgo;

  const logs = await db.log.findMany({
    where: { action: { startsWith: 'wa_' }, createdAt: { gte: costSince } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, action: true, message: true, authorName: true, metadata: true, createdAt: true },
  });

  const bot = {
    totalDecisions: 0, qualify: 0, disqualify: 0, handoff: 0, continueCount: 0,
    error: 0, doubts: 0, understoodRate: 0, successRate: 0, avgConfidence: 0,
    avgQualifyMinutes: null as number | null,
    intents: {} as Record<string, number>,
    emotions: {} as Record<string, number>,
  };

  let understoodTotal = 0;
  let understoodYes = 0;
  let confSum = 0;
  let confCount = 0;
  const qualifyDurations: number[] = [];

  const activity: ChatbotActivityItem[] = [];

  const cost = { weekUSD: 0, monthUSD: 0, weekTokens: 0, monthTokens: 0, model: null as string | null };
  const closeCategories: Record<string, number> = {};

  for (const l of logs) {
    const meta = (l.metadata ?? {}) as any;

    // Gasto com a API do Claude (janelas fixas de 7 e 30 dias).
    if (l.action === 'wa_bot' && meta.usage) {
      const usd = usageCostUSD(meta.usage);
      const tokens =
        (meta.usage.inputTokens ?? 0) + (meta.usage.outputTokens ?? 0) +
        (meta.usage.cacheReadTokens ?? 0) + (meta.usage.cacheWriteTokens ?? 0);
      if (!cost.model && meta.usage.model) cost.model = meta.usage.model;
      if (l.createdAt >= monthAgo) { cost.monthUSD += usd; cost.monthTokens += tokens; }
      if (l.createdAt >= weekAgo) { cost.weekUSD += usd; cost.weekTokens += tokens; }
    }

    // Métricas/atividade respeitam o filtro de período ativo.
    if (l.createdAt < since) continue;

    // Conta o desfecho tanto quando quem encerra é a IA (wa_bot) quanto o
    // atendente pelo menu "Encerrar" (wa_close).
    if ((l.action === 'wa_bot' || l.action === 'wa_close') && typeof meta.closeCategory === 'string') {
      closeCategories[meta.closeCategory] = (closeCategories[meta.closeCategory] ?? 0) + 1;
    }

    if (l.action === 'wa_bot') {
      const outcome: string = meta.outcome ?? 'continue';
      if (outcome === 'error') {
        bot.error += 1;
      } else {
        bot.totalDecisions += 1;
        if (outcome === 'qualify') bot.qualify += 1;
        else if (outcome === 'disqualify') bot.disqualify += 1;
        else if (outcome === 'handoff') bot.handoff += 1;
        else bot.continueCount += 1;

        const intent = String(meta.intent ?? 'outro');
        bot.intents[intent] = (bot.intents[intent] ?? 0) + 1;
        if (intent === 'duvida') bot.doubts += 1;

        const emotion = String(meta.emotion ?? 'neutro');
        bot.emotions[emotion] = (bot.emotions[emotion] ?? 0) + 1;

        if (typeof meta.understood === 'boolean') {
          understoodTotal += 1;
          if (meta.understood) understoodYes += 1;
        }
        if (typeof meta.confidence === 'number') {
          confSum += meta.confidence;
          confCount += 1;
        }
        if (outcome === 'qualify' && typeof meta.durationMs === 'number' && meta.durationMs > 0) {
          qualifyDurations.push(meta.durationMs);
        }
      }
    } else {
      // Ações de atendentes → feed com todos os logs do filtro ativo (a UI rola).
      if (activity.length < 500) {
        activity.push({
          id: l.id,
          at: l.createdAt.toISOString(),
          authorName: l.authorName,
          action: l.action,
          message: l.message,
          contactName: meta.contactName ?? null,
        });
      }
    }
  }

  const totalDecisionsAndErrors = bot.totalDecisions + bot.error;
  bot.understoodRate = understoodTotal ? Math.round((understoodYes / understoodTotal) * 100) : 0;
  bot.successRate = totalDecisionsAndErrors ? Math.round((bot.totalDecisions / totalDecisionsAndErrors) * 100) : 0;
  bot.avgConfidence = confCount ? Math.round((confSum / confCount) * 100) : 0;
  bot.avgQualifyMinutes = qualifyDurations.length
    ? Math.round(qualifyDurations.reduce((a, b) => a + b, 0) / qualifyDurations.length / 60000)
    : null;

  // Ordena intents pelos rótulos amigáveis (mantém as chaves brutas, o front
  // traduz — mas já reescrevemos as chaves conhecidas para o rótulo).
  const intentsLabeled: Record<string, number> = {};
  for (const [k, v] of Object.entries(bot.intents)) {
    intentsLabeled[INTENT_LABELS[k] ?? k] = v;
  }
  bot.intents = intentsLabeled;

  cost.weekUSD = Math.round(cost.weekUSD * 10000) / 10000;
  cost.monthUSD = Math.round(cost.monthUSD * 10000) / 10000;

  return { periodDays, bot, cost, closeCategories, activity };
}

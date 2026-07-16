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

// Aviso administrativo da Meta (webhook account_update, qualidade do número,
// status de template...) — gravado como log "wa_account" pelo webhook.
export interface MetaAccountEvent {
  id: string;
  at: string;
  message: string;
  field: string; // campo do webhook (account_update, phone_number_quality_update...)
  severity: 'critical' | 'warning' | 'ok' | 'info';
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
  // Desempenho do atendimento HUMANO no período: quem assumiu/encerrou/enviou
  // e o tempo médio até a primeira resposta depois de assumir.
  team: {
    attendants: {
      name: string;
      assumed: number;              // conversas assumidas (inclui reaberturas)
      closed: number;               // atendimentos encerrados
      messages: number;             // mensagens/mídias enviadas ao cliente
      avgFirstResponseMin: number | null; // média assumir → 1ª resposta (min)
    }[];
  };
  activity: ChatbotActivityItem[];
  // Saúde da conta: avisos oficiais da Meta no período (violação, restrição,
  // qualidade do número, templates). Vazio = conta sem ocorrências.
  accountEvents: MetaAccountEvent[];
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

  const [logs, humanMessages] = await Promise.all([
    db.log.findMany({
      where: { action: { startsWith: 'wa_' }, createdAt: { gte: costSince } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, action: true, message: true, authorId: true, authorName: true, metadata: true, createdAt: true },
    }),
    // Mensagens humanas do período — alimenta a 1ª resposta após assumir.
    db.whatsAppMessage.findMany({
      where: { direction: 'out', sentByBot: false, internal: false, createdAt: { gte: since }, authorId: { not: null } },
      orderBy: { createdAt: 'asc' },
      select: { contactId: true, authorId: true, createdAt: true },
    }),
  ]);

  // Índice authorId:contactId → timestamps das mensagens (já em ordem asc).
  const msgTimes = new Map<string, number[]>();
  for (const m of humanMessages) {
    const k = `${m.authorId}:${m.contactId}`;
    const arr = msgTimes.get(k) ?? [];
    arr.push(m.createdAt.getTime());
    msgTimes.set(k, arr);
  }

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
  const accountEvents: MetaAccountEvent[] = [];

  const cost = { weekUSD: 0, monthUSD: 0, weekTokens: 0, monthTokens: 0, model: null as string | null };
  const closeCategories: Record<string, number> = {};

  // Desempenho por atendente (chaveado por authorId).
  const teamStats = new Map<string, {
    name: string; assumed: number; closed: number; messages: number; firstResponses: number[];
  }>();
  function attendantOf(authorId: string | null, authorName: string) {
    const key = authorId ?? authorName;
    let s = teamStats.get(key);
    if (!s) { s = { name: authorName, assumed: 0, closed: 0, messages: 0, firstResponses: [] }; teamStats.set(key, s); }
    return s;
  }

  for (const l of logs) {
    const meta = (l.metadata ?? {}) as any;

    // Gasto com a API do Claude (janelas fixas de 7 e 30 dias). Entram na
    // conta as decisões do bot (wa_bot) e as chamadas de agent-assist —
    // sugestão de resposta (wa_suggest) e resumo pro card (wa_summary).
    if (['wa_bot', 'wa_suggest', 'wa_summary'].includes(l.action) && meta.usage) {
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

    // Avisos da Meta (webhook administrativo) → seção "Saúde da conta".
    // Não entram na atividade da equipe nem nas estatísticas de atendente.
    if (l.action === 'wa_account') {
      if (accountEvents.length < 100) {
        const sev = String(meta.severity ?? '');
        accountEvents.push({
          id: l.id,
          at: l.createdAt.toISOString(),
          message: l.message,
          field: String(meta.field ?? ''),
          severity: sev === 'critical' || sev === 'warning' || sev === 'ok' ? sev : 'info',
        });
      }
      continue;
    }

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

      // Estatísticas por atendente.
      const s = attendantOf(l.authorId, l.authorName);
      if (l.action === 'wa_assign' || l.action === 'wa_reopen') {
        s.assumed += 1;
        // 1ª resposta: primeira mensagem DESSE atendente PRA ESSE contato
        // depois do assumir (janela de até 24h pra descartar outliers).
        const contactId = meta.contactId as string | undefined;
        if (l.authorId && contactId) {
          const times = msgTimes.get(`${l.authorId}:${contactId}`) ?? [];
          const t0 = l.createdAt.getTime();
          const first = times.find((t) => t > t0);
          if (first && first - t0 < 24 * 60 * 60_000) s.firstResponses.push(first - t0);
        }
      } else if (l.action === 'wa_close') {
        s.closed += 1;
      } else if (['wa_text', 'wa_media', 'wa_document', 'wa_template'].includes(l.action)) {
        s.messages += 1;
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

  const attendants = [...teamStats.values()]
    .map((s) => ({
      name: s.name,
      assumed: s.assumed,
      closed: s.closed,
      messages: s.messages,
      avgFirstResponseMin: s.firstResponses.length
        ? Math.round(s.firstResponses.reduce((a, b) => a + b, 0) / s.firstResponses.length / 60_000)
        : null,
    }))
    .filter((s) => s.assumed || s.closed || s.messages)
    .sort((a, b) => b.messages - a.messages);

  return { periodDays, bot, cost, closeCategories, team: { attendants }, activity, accountEvents };
}

'use server';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { db } from '@/app/_shared/lib/prisma';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';
import { canViewChatbotDashboard } from '@/app/_shared/lib/chatbot-access';
import { fetchAdNames } from '@/app/_shared/lib/whatsapp/meta-ad-names';
import { CLOSE_CATEGORY_LABELS } from '@/app/_shared/lib/whatsapp/close-categories';
import { brDayKey, brDayKeySeries, brLabelFromKey, brStartOfDay, brStartOfDaysAgo } from '@/app/_shared/utils/date-br';

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
    // Mediana do tempo entre o início da conversa e a qualificação (mediana
    // porque conversas reabertas dias depois distorcem a média).
    avgQualifyMinutes: number | null;
    intents: Record<string, number>;
    emotions: Record<string, number>;
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
  // Atribuição de origem dos leads (Click-to-WhatsApp): contatos novos no
  // período agrupados por plataforma e por anúncio. "organic" = chegou sem
  // referral (link direto, indicação, busca...).
  adOrigins: {
    byPlatform: Record<string, number>; // facebook | instagram | meta | organic
    // campaignName/adsetName/adName vêm da Marketing API (META_ADS_TOKEN com
    // ads_read); sem token válido ficam null e a UI cai no headline + id.
    byAd: {
      platform: string; headline: string | null; sourceId: string | null; sourceUrl: string | null; count: number;
      // Quebra por plataforma DENTRO do anúncio (o mesmo anúncio roda no
      // Facebook e no Instagram — antes só o ícone da 1ª origem aparecia).
      platforms: Record<string, number>;
      adName: string | null; adsetName: string | null; campaignName: string | null;
      // Desfecho dos leads deste anúncio — qual campanha CONVERTE, não só traz volume.
      qualified: number; disqualified: number; pending: number;
    }[];
    // Desfecho agregado por plataforma (inclui o orgânico, que não tem anúncio).
    outcomesByPlatform: Record<string, { qualified: number; disqualified: number; pending: number }>;
    // Leads novos por DIA no período, quebrados por plataforma — mostra se a
    // campanha está crescendo ou perdendo tração.
    daily: {
      date: string; label: string; total: number;
      facebook: number; instagram: number; meta: number; organic: number;
    }[];
    totalNewContacts: number;
  };
  // Avisos AUTOMÁTICOS ao cliente (progresso do card + automações): entregas
  // e falhas no período. Ficam FORA da atividade/estatística da equipe — o
  // "autor" do log é só quem moveu o card, não quem mandou mensagem.
  autoNotify: {
    sent: number;
    failed: number;
    silenceAlerts: number; // clientes com N avisos seguidos sem resposta
    byReason: Record<string, number>; // sem-opt-in | cooldown | sem-template | opt-out | meta-rejeitou | outro
    failures: { id: string; at: string; contactName: string | null; authorName: string; reason: string; source: string }[];
  };
  activity: ChatbotActivityItem[];
  // Saúde da conta: avisos oficiais da Meta no período (violação, restrição,
  // qualidade do número, templates). Vazio = conta sem ocorrências.
  accountEvents: MetaAccountEvent[];
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

export async function getChatbotAnalytics(
  periodDays: 7 | 30 | 90 = 7,
  numberId: string | null = null,
  fromISO?: string,
  toISO?: string,
): Promise<ChatbotAnalytics> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Não autenticado.');
  if (!canViewChatbotDashboard(session.user.email)) {
    throw new Error('Acesso restrito: você não está autorizado a ver o Desempenho do Chatbot.');
  }

  // Todo corte de dia é no fuso de Brasília: em produção o Node roda em UTC e
  // das 21h em diante o servidor já virava o dia (o gráfico abria um bucket de
  // amanhã enquanto aqui ainda era hoje).
  //
  // from/to (ISO) têm prioridade sobre periodDays — o calendário do dashboard
  // manda o intervalo livre; os botões 7/30/90 continuam funcionando.
  let since = brStartOfDaysAgo(periodDays - 1);
  let until: Date | null = null;
  let seriesDays: number = periodDays;
  let seriesUntil = new Date();
  if (fromISO && toISO) {
    const f = new Date(fromISO);
    const t = new Date(toISO);
    if (!Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime()) && f <= t) {
      since = f;
      until = t;
      seriesUntil = t;
      seriesDays = Math.min(
        Math.max(Math.round((brStartOfDay(t).getTime() - brStartOfDay(f).getTime()) / 86_400_000) + 1, 1),
        366,
      );
    }
  }
  const createdIn = until ? { gte: since, lte: until } : { gte: since };

  // Filtro MULTI-NÚMERO: null = visão agregada (todos os números, como sempre
  // foi). Mensagens/contatos filtram direto pela coluna numberId (indexada);
  // os LOGS não têm a coluna — são filtrados abaixo resolvendo o numberId do
  // contactId que cada log carrega no metadata.
  const numberFilter = numberId ? { numberId } : {};

  const [rawLogs, humanMessages, newContacts] = await Promise.all([
    db.log.findMany({
      where: { action: { startsWith: 'wa_' }, createdAt: createdIn },
      orderBy: { createdAt: 'desc' },
      select: { id: true, action: true, message: true, authorId: true, authorName: true, metadata: true, createdAt: true },
    }),
    // Mensagens humanas do período — alimenta a 1ª resposta após assumir.
    db.whatsAppMessage.findMany({
      where: { direction: 'out', sentByBot: false, internal: false, createdAt: createdIn, authorId: { not: null }, ...numberFilter },
      orderBy: { createdAt: 'asc' },
      select: { contactId: true, authorId: true, createdAt: true },
    }),
    // Contatos novos do período — base da atribuição de origem (CTWA ads).
    // Só contatos que MANDARAM mensagem (optInSource=inbound): os avisos de
    // progresso do kanban criam contatos "fantasma" a partir do telefone do
    // card, e esses não são leads (o cliente nunca escreveu).
    db.whatsAppContact.findMany({
      where: { createdAt: createdIn, optInSource: 'inbound', ...numberFilter },
      select: { id: true, adPlatform: true, adHeadline: true, adSourceId: true, adSourceUrl: true, createdAt: true },
    }),
  ]);

  // Logs por número: o metadata carrega o contactId; resolve o numberId de
  // cada contato citado e mantém só os do número pedido. Logs sem contactId
  // (eventos administrativos da conta) ficam de fora da visão por número.
  let logs = rawLogs;
  if (numberId) {
    const logContactIds = Array.from(new Set(
      rawLogs.map((l) => (l.metadata as any)?.contactId).filter((id): id is string => typeof id === 'string'),
    ));
    const owned = new Set(
      (await db.whatsAppContact.findMany({
        where: { id: { in: logContactIds }, numberId },
        select: { id: true },
      })).map((c) => c.id),
    );
    logs = rawLogs.filter((l) => owned.has((l.metadata as any)?.contactId));
  }

  // Desfecho de cada lead novo (qualificado / não qualificado / em andamento)
  // — é o que liga a campanha ao RESULTADO, não só ao volume.
  const leadConversations = await db.whatsAppConversation.findMany({
    where: { contactId: { in: newContacts.map((c) => c.id) } },
    select: { contactId: true, status: true, qualified: true, closeCategory: true },
  });
  const outcomeByContact = new Map(leadConversations.map((c) => [c.contactId, c]));
  const outcomeOf = (contactId: string): 'qualified' | 'disqualified' | 'pending' => {
    const conv = outcomeByContact.get(contactId);
    if (!conv) return 'pending';
    if (conv.qualified === true || conv.closeCategory === 'qualificado') return 'qualified';
    if (conv.status === 'closed') return 'disqualified';
    return 'pending';
  };

  // Agrupa origem dos leads: por plataforma e por anúncio individual.
  // Série diária: um ponto por dia do período (dias sem lead entram zerados,
  // senão o gráfico "pula" a data e a queda fica invisível).
  const dailyMap = new Map<string, ChatbotAnalytics['adOrigins']['daily'][number]>();
  for (const key of brDayKeySeries(seriesDays, seriesUntil)) {
    dailyMap.set(key, {
      date: key,
      label: brLabelFromKey(key),
      total: 0, facebook: 0, instagram: 0, meta: 0, organic: 0,
    });
  }

  const adOrigins = {
    byPlatform: {} as Record<string, number>,
    byAd: [] as ChatbotAnalytics['adOrigins']['byAd'],
    outcomesByPlatform: {} as ChatbotAnalytics['adOrigins']['outcomesByPlatform'],
    daily: [] as ChatbotAnalytics['adOrigins']['daily'],
    totalNewContacts: newContacts.length,
  };
  const adKeyMap = new Map<string, (typeof adOrigins.byAd)[number]>();
  for (const c of newContacts) {
    const platform = c.adPlatform ?? 'organic';
    adOrigins.byPlatform[platform] = (adOrigins.byPlatform[platform] ?? 0) + 1;

    const outcome = outcomeOf(c.id);
    const platOutcome = adOrigins.outcomesByPlatform[platform]
      ?? (adOrigins.outcomesByPlatform[platform] = { qualified: 0, disqualified: 0, pending: 0 });
    platOutcome[outcome] += 1;

    const dk = brDayKey(c.createdAt);
    const day = dailyMap.get(dk);
    if (day) {
      day.total += 1;
      // Plataforma desconhecida cai em "meta" (é um anúncio, só não sabemos a rede).
      const bucket = (['facebook', 'instagram', 'organic'] as const).find((k) => k === platform) ?? 'meta';
      day[bucket] += 1;
    }

    if (!c.adPlatform) continue;
    const key = c.adSourceId ?? c.adHeadline ?? c.adSourceUrl ?? 'desconhecido';
    let entry = adKeyMap.get(key);
    if (!entry) {
      entry = {
        platform, headline: c.adHeadline, sourceId: c.adSourceId, sourceUrl: c.adSourceUrl, count: 0,
        platforms: {}, adName: null, adsetName: null, campaignName: null,
        qualified: 0, disqualified: 0, pending: 0,
      };
      adKeyMap.set(key, entry);
      adOrigins.byAd.push(entry);
    }
    entry.count += 1;
    entry.platforms[platform] = (entry.platforms[platform] ?? 0) + 1;
    entry[outcome] += 1;
  }
  adOrigins.daily = [...dailyMap.values()];
  adOrigins.byAd.sort((a, b) => b.count - a.count);
  // Ícone principal do anúncio = plataforma com mais leads (não a 1ª a chegar).
  for (const entry of adOrigins.byAd) {
    const top = Object.entries(entry.platforms).sort((a, b) => b[1] - a[1])[0];
    if (top) entry.platform = top[0];
  }

  // Enriquece com os nomes reais (Campanha › Conjunto › Anúncio) da Marketing
  // API — mesma visão do Gerenciador de Anúncios. Best-effort com cache.
  const adNames = await fetchAdNames(
    adOrigins.byAd.map((a) => a.sourceId).filter((id): id is string => !!id),
  );
  for (const entry of adOrigins.byAd) {
    const names = entry.sourceId ? adNames.get(entry.sourceId) : undefined;
    if (names) {
      entry.adName = names.adName;
      entry.adsetName = names.adsetName;
      entry.campaignName = names.campaignName;
    }
  }

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

  const closeCategories: Record<string, number> = {};

  const autoNotify = {
    sent: 0,
    failed: 0,
    silenceAlerts: 0,
    byReason: {} as Record<string, number>,
    failures: [] as { id: string; at: string; contactName: string | null; authorName: string; reason: string; source: string }[],
  };
  // Normaliza o motivo da falha: logs novos têm metadata.reason; os antigos
  // (antes do reason existir em todos os casos) caem no parse da mensagem.
  function failReasonOf(meta: any, message: string): string {
    const raw = String(meta.reason ?? '');
    if (raw === 'sem opt-in') return 'sem-opt-in';
    if (raw === 'cooldown') return 'cooldown';
    if (raw === 'sem template') return 'sem-template';
    if (raw === 'opt-out') return 'opt-out';
    if (raw === 'meta rejeitou') return 'meta-rejeitou';
    if (message.includes('sem opt-in')) return 'sem-opt-in';
    if (message.includes('intervalo mínimo')) return 'cooldown';
    if (message.includes('nenhum template')) return 'sem-template';
    return 'outro';
  }

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

    // Métricas/atividade respeitam o filtro de período ativo.
    if (l.createdAt < since || (until && l.createdAt > until)) continue;

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
    } else if (meta.automated === true) {
      // Aviso AUTOMÁTICO (progresso do card/automação): não é ação do
      // atendente — o authorName é só quem moveu o card. Vai pro painel
      // próprio de entregas/falhas, fora do feed e das estatísticas da equipe.
      if (typeof meta.unansweredCount === 'number') {
        autoNotify.silenceAlerts += 1;
      } else if (meta.skipped === true) {
        autoNotify.failed += 1;
        const reason = failReasonOf(meta, l.message);
        autoNotify.byReason[reason] = (autoNotify.byReason[reason] ?? 0) + 1;
        if (autoNotify.failures.length < 100) {
          autoNotify.failures.push({
            id: l.id,
            at: l.createdAt.toISOString(),
            contactName: meta.contactName ?? null,
            authorName: l.authorName,
            reason,
            source: String(meta.source ?? ''),
          });
        }
      } else {
        autoNotify.sent += 1;
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
  // MEDIANA, não média: `durationMs` conta desde a criação do registro da
  // conversa, então um contato que voltou no dia seguinte entra com 20h+ e
  // arrastava a média toda para cima (era o "1416 min" do painel).
  if (qualifyDurations.length) {
    const sorted = [...qualifyDurations].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianMs = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    bot.avgQualifyMinutes = Math.round(medianMs / 60000);
  } else {
    bot.avgQualifyMinutes = null;
  }

  // Ordena intents pelos rótulos amigáveis (mantém as chaves brutas, o front
  // traduz — mas já reescrevemos as chaves conhecidas para o rótulo).
  const intentsLabeled: Record<string, number> = {};
  for (const [k, v] of Object.entries(bot.intents)) {
    intentsLabeled[INTENT_LABELS[k] ?? k] = v;
  }
  bot.intents = intentsLabeled;


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

  return { periodDays: seriesDays, bot, closeCategories, team: { attendants }, adOrigins, autoNotify, activity, accountEvents };
}

// ─── Funil de leads por período: tags aplicadas + desfechos do bot ──────────

export type LeadFunnelRange = 'today' | 'yesterday' | '7d' | '15d' | '30d' | '90d';

export interface LeadFunnelData {
  range: LeadFunnelRange;
  newLeads: number; // contatos novos que escreveram no período
  bot: { qualified: number; disqualified: number }; // decisões da IA no período
  // TODAS as tags cadastradas, com quantas conversas receberam cada uma NO
  // período (pela data de aplicação da tag) — inclui as zeradas.
  tags: { id: string; name: string; color: string; count: number }[];
  // Funil por etapa no estilo Botconversa (11/08/2026) — cada número é de
  // CONTATOS DISTINTOS no período (decisões repetidas do bot não inflam).
  steps: {
    iniciados: number;       // contatos novos que escreveram
    docsEnviados: number;    // receberam fluxo com "documento" no nome
    qualificados: number;    // bot qualificou
    desqualificados: number; // bot desqualificou
    contratados: number;     // tag "Contratado*" aplicada no período
  };
}

function leadFunnelWindow(range: LeadFunnelRange): { since: Date; until: Date | null } {
  switch (range) {
    case 'today':     return { since: brStartOfDaysAgo(0), until: null };
    case 'yesterday': return { since: brStartOfDaysAgo(1), until: brStartOfDaysAgo(0) };
    case '7d':        return { since: brStartOfDaysAgo(6), until: null };
    case '15d':       return { since: brStartOfDaysAgo(14), until: null };
    case '30d':       return { since: brStartOfDaysAgo(29), until: null };
    case '90d':       return { since: brStartOfDaysAgo(89), until: null };
  }
}

export async function getLeadFunnel(
  range: LeadFunnelRange,
  numberId: string | null = null,
): Promise<LeadFunnelData> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Não autenticado.');
  if (!canViewChatbotDashboard(session.user.email)) {
    throw new Error('Acesso restrito.');
  }

  const { since, until } = leadFunnelWindow(range);
  const createdAt = until ? { gte: since, lt: until } : { gte: since };

  const [allTags, tagApplications, newLeads, botLogs, flowLogs] = await Promise.all([
    db.whatsAppTag.findMany({ select: { id: true, name: true, color: true }, orderBy: { name: 'asc' } }),
    // Data de APLICAÇÃO da tag (não da conversa): "quantos contratados neste
    // período". Atenção: linhas anteriores a 03/08/2026 herdaram a data da
    // migration (histórico antigo não é recuperável).
    db.whatsAppConversationTag.findMany({
      where: { createdAt, ...(numberId ? { conversation: { numberId } } : {}) },
      select: { tagId: true },
    }),
    db.whatsAppContact.count({
      where: { createdAt, optInSource: 'inbound', ...(numberId ? { numberId } : {}) },
    }),
    db.log.findMany({
      where: { action: 'wa_bot', createdAt },
      select: { metadata: true },
    }),
    // Disparos de fluxo (bot e equipe): "enviada lista de documentos" =
    // fluxo com "documento"/"doc" no nome disparado pro contato.
    db.log.findMany({
      where: { action: 'wa_flow', createdAt },
      select: { metadata: true },
    }),
  ]);

  const countByTag = new Map<string, number>();
  for (const t of tagApplications) countByTag.set(t.tagId, (countByTag.get(t.tagId) ?? 0) + 1);

  // Filtro por número nos logs do bot: resolve o dono de cada contactId citado
  // (os logs não têm coluna numberId — mesmo esquema do getChatbotAnalytics).
  let logs = botLogs;
  if (numberId) {
    const ids = Array.from(new Set(
      botLogs.map((l) => (l.metadata as any)?.contactId).filter((id): id is string => typeof id === 'string'),
    ));
    const owned = new Set(
      (await db.whatsAppContact.findMany({ where: { id: { in: ids }, numberId }, select: { id: true } })).map((c) => c.id),
    );
    logs = botLogs.filter((l) => owned.has((l.metadata as any)?.contactId));
  }

  const bot = { qualified: 0, disqualified: 0 };
  const qualifiedContacts = new Set<string>();
  const disqualifiedContacts = new Set<string>();
  for (const l of logs) {
    const meta = l.metadata as any;
    const outcome = meta?.outcome;
    const cid = typeof meta?.contactId === 'string' ? meta.contactId : null;
    if (outcome === 'qualify') {
      bot.qualified += 1;
      if (cid) qualifiedContacts.add(cid);
    } else if (outcome === 'disqualify') {
      bot.disqualified += 1;
      if (cid) disqualifiedContacts.add(cid);
    }
  }

  // "Enviada lista de documentos": fluxos de docs disparados no período,
  // por contato distinto. Também conta os send_flow do próprio bot (wa_bot).
  const docsContacts = new Set<string>();
  const isDocsFlow = (name: unknown) => typeof name === 'string' && /doc/i.test(name);
  for (const l of flowLogs) {
    const meta = l.metadata as any;
    if (isDocsFlow(meta?.flowName) && typeof meta?.contactId === 'string') docsContacts.add(meta.contactId);
  }
  for (const l of logs) {
    const meta = l.metadata as any;
    if (isDocsFlow(meta?.flowName) && typeof meta?.contactId === 'string') docsContacts.add(meta.contactId);
  }

  const tags = allTags.map((t) => ({ ...t, count: countByTag.get(t.id) ?? 0 }));
  // "Contratado" = assinou o contrato (tag aplicada quando o link é assinado).
  const contratados = tags
    .filter((t) => /contratad/i.test(t.name))
    .reduce((a, t) => a + t.count, 0);

  return {
    range,
    newLeads,
    bot,
    tags,
    steps: {
      iniciados: newLeads,
      docsEnviados: docsContacts.size,
      qualificados: qualifiedContacts.size,
      desqualificados: disqualifiedContacts.size,
      contratados,
    },
  };
}

// ─── Drill-down da campanha: quem qualificou, quem não, e por quê ───────────

export interface AdLeadOutcome {
  contactId: string;
  name: string | null;
  phone: string;
  createdAt: string;
  outcome: 'qualified' | 'disqualified' | 'pending';
  /** Motivo legível (categoria de encerramento) — null se em andamento. */
  reason: string | null;
  /** Nº do card, quando o lead virou cliente. */
  cardNumber: number | null;
}

/**
 * Leads de UM anúncio (ou do orgânico) no período, com o desfecho de cada um.
 * `sourceKey` é o mesmo agrupador do byAd (adSourceId ?? headline ?? url);
 * null = leads orgânicos (sem anúncio).
 */
export async function getAdLeadOutcomes(
  sourceKey: string | null,
  periodDays: 7 | 30 | 90 = 7,
  numberId: string | null = null,
  fromISO?: string,
  toISO?: string,
): Promise<AdLeadOutcome[]> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error('Não autenticado.');
  if (!canViewChatbotDashboard(session.user.email)) {
    throw new Error('Acesso restrito.');
  }

  // from/to (ISO) têm prioridade sobre periodDays (calendário do dashboard).
  let createdAt: { gte: Date; lte?: Date } = { gte: brStartOfDaysAgo(periodDays - 1) };
  if (fromISO && toISO) {
    const f = new Date(fromISO);
    const t = new Date(toISO);
    if (!Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime())) createdAt = { gte: f, lte: t };
  }
  const contacts = await db.whatsAppContact.findMany({
    where: { createdAt, optInSource: 'inbound', ...(numberId ? { numberId } : {}) },
    select: {
      id: true, name: true, phone: true, createdAt: true, userId: true,
      adPlatform: true, adSourceId: true, adHeadline: true, adSourceUrl: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Mesma chave de agrupamento do byAd — o clique no card abre exatamente
  // os leads daquela linha.
  const mine = contacts.filter((c) => {
    if (sourceKey === null) return !c.adPlatform;
    if (!c.adPlatform) return false;
    return (c.adSourceId ?? c.adHeadline ?? c.adSourceUrl ?? 'desconhecido') === sourceKey;
  });
  if (!mine.length) return [];

  const [conversations, users] = await Promise.all([
    db.whatsAppConversation.findMany({
      where: { contactId: { in: mine.map((c) => c.id) } },
      select: { contactId: true, status: true, qualified: true, closeCategory: true },
    }),
    db.user.findMany({
      where: { id: { in: mine.map((c) => c.userId).filter((id): id is string => !!id) } },
      select: { id: true, cardNumber: true },
    }),
  ]);
  const convByContact = new Map(conversations.map((c) => [c.contactId, c]));
  const cardByUser = new Map(users.map((u) => [u.id, u.cardNumber]));

  return mine.map((c) => {
    const conv = convByContact.get(c.id);
    const qualified = conv?.qualified === true || conv?.closeCategory === 'qualificado';
    const closed = conv?.status === 'closed';
    const outcome: AdLeadOutcome['outcome'] = qualified ? 'qualified' : closed ? 'disqualified' : 'pending';
    return {
      contactId: c.id,
      name: c.name,
      phone: c.phone,
      createdAt: c.createdAt.toISOString(),
      outcome,
      reason: conv?.closeCategory ? CLOSE_CATEGORY_LABELS[conv.closeCategory] ?? conv.closeCategory : null,
      cardNumber: c.userId ? cardByUser.get(c.userId) ?? null : null,
    };
  });
}

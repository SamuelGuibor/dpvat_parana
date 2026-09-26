'use server';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Prisma } from '@prisma/client';
import { db } from '@/app/_shared/lib/prisma';
import { requireTeam } from '@/app/_shared/lib/permissions-server';
import { canViewChatbotDashboard } from '@/app/_shared/lib/chatbot-access';
import { fetchAdNames } from '@/app/_shared/lib/whatsapp/meta-ad-names';
import { CLOSE_CATEGORY_LABELS } from '@/app/_shared/lib/whatsapp/close-categories';
import { brDayKey, brDayKeySeries, brLabelFromKey, brStartOfDay, brStartOfDaysAgo } from '@/app/_shared/utils/date-br';
import {
  AUTO_NOTIFY_FAIL_HINTS, accountEventSeverity, aggregateBotRows, foldAutoNotifyRows,
  medianMsToMinutes, normalizeAutoNotifyFailReason,
  type AutoNotifyRow, type BotAggregate, type BotOutcomeRow,
} from '@/app/_shared/utils/chatbot-agg';

// Métricas do chatbot para o dashboard (aba Chatbot). Deriva tudo dos logs de
// WhatsApp (action começando com "wa_"):
//   - wa_bot: decisões da IA (qualify/disqualify/handoff/continue/erro), com
//     intent, understood, confidence e durationMs no metadata.
//   - wa_* com metadata.automated: avisos automáticos ao cliente.
//   - wa_account: avisos oficiais da Meta (saúde da conta).
//   - demais wa_*: feed de atividade dos atendentes.
// Desde 25/09/2026 tudo é AGREGADO no Postgres (antes o findMany trazia todos
// os logs wa_* do período — ~33 mil linhas / ~15 MB por abertura — para contar
// em JS). A regra de cada número é a do laço antigo; ver chatbot-agg.ts.
// A Origem dos leads (contatos novos por anúncio) saiu para getLeadOrigins,
// que não toca em logs.

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
  bot: BotAggregate & {
    // Mediana do tempo entre o início da conversa e a qualificação (mediana
    // porque conversas reabertas dias depois distorcem a média).
    avgQualifyMinutes: number | null;
  };
  // Avisos AUTOMÁTICOS ao cliente (progresso do card + automações): entregas
  // e falhas no período. Ficam FORA da atividade da equipe — o "autor" do log
  // é só quem moveu o card, não quem mandou mensagem.
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

// Atribuição de origem dos leads (Click-to-WhatsApp): contatos novos no
// período agrupados por plataforma e por anúncio. "organic" = chegou sem
// referral (link direto, indicação, busca...).
export interface AdOriginsData {
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
    qualified: number; disqualified: number; other: number; pending: number;
  }[];
  // Desfecho agregado por plataforma (inclui o orgânico, que não tem anúncio).
  outcomesByPlatform: Record<string, { qualified: number; disqualified: number; other: number; pending: number }>;
  // Leads novos por DIA no período, quebrados por plataforma — mostra se a
  // campanha está crescendo ou perdendo tração.
  daily: {
    date: string; label: string; total: number;
    facebook: number; instagram: number; meta: number; organic: number;
  }[];
  totalNewContacts: number;
}

/** Retorno de getLeadOrigins (seção "Origem dos leads" da aba Analytics). */
export interface LeadOriginsData {
  periodDays: number;
  adOrigins: AdOriginsData;
}

// Quem pode ver a aba Chatbot a UI sabe pela carga única do dashboard
// (getStrategicDashboardData → canViewChatbot), com a mesma allowlist.

/**
 * Trava das métricas do chatbot: equipe lendo o banco (requireTeam: role
 * atual + trava de IP) E allowlist por e-mail do painel. Antes era só
 * getServerSession + allowlist — sem a trava de IP.
 */
async function requireChatbotDashboard(): Promise<void> {
  const ctx = await requireTeam();
  if (!canViewChatbotDashboard(ctx.email)) {
    throw new Error('Acesso restrito: você não está autorizado a ver o Desempenho do Chatbot.');
  }
}

/**
 * Janela do período. Todo corte de dia é no fuso de Brasília: em produção o
 * Node roda em UTC e das 21h em diante o servidor já virava o dia.
 * from/to (ISO) têm prioridade sobre periodDays — o calendário do dashboard
 * manda o intervalo livre; os botões 7/30/90 continuam funcionando.
 */
function resolveWindow(periodDays: 7 | 30 | 90, fromISO?: string, toISO?: string) {
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
  return { since, until, seriesDays, seriesUntil };
}

export async function getChatbotAnalytics(
  periodDays: 7 | 30 | 90 = 7,
  numberId: string | null = null,
  fromISO?: string,
  toISO?: string,
): Promise<ChatbotAnalytics> {
  await requireChatbotDashboard();
  const { since, until, seriesDays } = resolveWindow(periodDays, fromISO, toISO);

  // Período dos logs (instantes absolutos; o corte de dia já veio de date-br).
  const inPeriod = until
    ? Prisma.sql`l."createdAt" >= ${since} AND l."createdAt" <= ${until}`
    : Prisma.sql`l."createdAt" >= ${since}`;
  // Filtro MULTI-NÚMERO: logs não têm coluna numberId — o metadata carrega o
  // contactId, e o JOIN mantém só os logs de contatos do número pedido. Log
  // sem contactId (evento administrativo da conta) some da visão por número.
  // null = visão agregada (todos os números).
  const byNumber = numberId
    ? Prisma.sql`JOIN whatsapp_contacts ct ON ct.id = l.metadata->>'contactId' AND ct."numberId" = ${numberId}`
    : Prisma.empty;
  // Prefixo "wa_" por left(): no LIKE o "_" é curinga ('wa_%' casaria "waX...").
  // Não usa o índice [action, createdAt] (seq scan em logs), mas só trafegam
  // as linhas agregadas/limitadas — era o findMany sem teto que pesava.
  // wa_account/wa_media_fail/wa_bot têm bloco próprio (ou nenhum), como no
  // laço antigo.
  const otherWaLogs = Prisma.sql`left(l.action, 3) = 'wa_' AND l.action NOT IN ('wa_account', 'wa_media_fail', 'wa_bot')`;
  // Aviso automático = metadata.automated === true (boolean). `->` compara
  // jsonb: string "true" não conta, e metadata sem a chave dá NULL — por isso
  // a exclusão usa IS DISTINCT FROM (NOT (NULL = …) descartaria a linha).
  const isAutomated = Prisma.sql`l.metadata->'automated' = 'true'::jsonb`;
  const notAutomated = Prisma.sql`(l.metadata->'automated') IS DISTINCT FROM 'true'::jsonb`;
  // Precedência do laço antigo: silêncio > falha (skipped=true) > entregue.
  const isSilence = Prisma.sql`jsonb_typeof(l.metadata->'unansweredCount') = 'number'`;
  const isFailed = Prisma.sql`jsonb_typeof(l.metadata->'unansweredCount') IS DISTINCT FROM 'number' AND l.metadata->'skipped' = 'true'::jsonb`;

  const [botRows, qualifyRows, autoRows, failureRows, activityRows, accountRows] = await Promise.all([
    // Q1 — decisões da IA por outcome. action = 'wa_bot' (igualdade) usa o
    // índice [action, createdAt]. Todo cast de metadata é protegido por
    // jsonb_typeof: um valor de tipo inesperado não derruba a query.
    db.$queryRaw<BotOutcomeRow[]>`
      SELECT COALESCE(l.metadata->>'outcome', 'continue') AS outcome,
             count(*)::int AS n,
             count(*) FILTER (WHERE l.metadata->>'intent' = 'duvida')::int AS doubts,
             count(*) FILTER (WHERE jsonb_typeof(l.metadata->'understood') = 'boolean')::int AS "understoodTotal",
             count(*) FILTER (WHERE l.metadata->'understood' = 'true'::jsonb)::int AS "understoodYes",
             COALESCE(sum(CASE WHEN jsonb_typeof(l.metadata->'confidence') = 'number'
                               THEN (l.metadata->>'confidence')::float8 END), 0)::float8 AS "confSum",
             count(*) FILTER (WHERE jsonb_typeof(l.metadata->'confidence') = 'number')::int AS "confN"
      FROM logs l
      ${byNumber}
      WHERE l.action = 'wa_bot' AND ${inPeriod}
      GROUP BY 1
    `,
    // Q2 — mediana até qualificar. O CASE guarda o cast (num AND do WHERE o
    // Postgres não garante a ordem de avaliação e o ::float8 poderia explodir).
    db.$queryRaw<{ median: number | null }[]>`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY d)::float8 AS median
      FROM (
        SELECT CASE WHEN jsonb_typeof(l.metadata->'durationMs') = 'number'
                    THEN (l.metadata->>'durationMs')::float8 END AS d
        FROM logs l
        ${byNumber}
        WHERE l.action = 'wa_bot' AND l.metadata->>'outcome' = 'qualify' AND ${inPeriod}
      ) q
      WHERE d > 0
    `,
    // Q3 — avisos automáticos: contadores + motivos das falhas num GROUP BY
    // só. O motivo é normalizado no JS (foldAutoNotifyRows) com os mesmos
    // trechos de mensagem dos logs antigos.
    db.$queryRaw<AutoNotifyRow[]>`
      SELECT s.kind,
             CASE WHEN s.kind = 'failed' THEN s.reason END AS reason,
             CASE WHEN s.kind = 'failed' THEN strpos(s.message, ${AUTO_NOTIFY_FAIL_HINTS.optIn}) > 0 END AS "optIn",
             CASE WHEN s.kind = 'failed' THEN strpos(s.message, ${AUTO_NOTIFY_FAIL_HINTS.cooldown}) > 0 END AS cooldown,
             CASE WHEN s.kind = 'failed' THEN strpos(s.message, ${AUTO_NOTIFY_FAIL_HINTS.noTemplate}) > 0 END AS "noTemplate",
             count(*)::int AS n
      FROM (
        SELECT CASE WHEN ${isSilence} THEN 'silence'
                    WHEN l.metadata->'skipped' = 'true'::jsonb THEN 'failed'
                    ELSE 'sent' END AS kind,
               l.metadata->>'reason' AS reason,
               l.message
        FROM logs l
        ${byNumber}
        WHERE ${otherWaLogs} AND ${isAutomated} AND ${inPeriod}
      ) s
      GROUP BY 1, 2, 3, 4, 5
    `,
    // Q3c — as 100 falhas mais recentes (tabela de auditoria da UI).
    db.$queryRaw<{
      id: string; at: Date; authorName: string; message: string;
      reason: string | null; contactName: string | null; source: string;
    }[]>`
      SELECT l.id, l."createdAt" AS at, l."authorName", l.message,
             l.metadata->>'reason' AS reason,
             l.metadata->>'contactName' AS "contactName",
             COALESCE(l.metadata->>'source', '') AS source
      FROM logs l
      ${byNumber}
      WHERE ${otherWaLogs} AND ${isAutomated} AND ${isFailed} AND ${inPeriod}
      ORDER BY l."createdAt" DESC
      LIMIT 100
    `,
    // Q4 — feed de atividade dos atendentes (a UI rola; teto de 500).
    db.$queryRaw<{
      id: string; at: Date; authorName: string; action: string; message: string; contactName: string | null;
    }[]>`
      SELECT l.id, l."createdAt" AS at, l."authorName", l.action, l.message,
             l.metadata->>'contactName' AS "contactName"
      FROM logs l
      ${byNumber}
      WHERE ${otherWaLogs} AND ${notAutomated} AND ${inPeriod}
      ORDER BY l."createdAt" DESC
      LIMIT 500
    `,
    // Q5 — saúde da conta. Log wa_account não tem contactId: na visão por
    // número ele sempre ficou de fora, então nem consulta.
    numberId
      ? Promise.resolve([] as { id: string; at: Date; message: string; field: string; severity: string }[])
      : db.$queryRaw<{ id: string; at: Date; message: string; field: string; severity: string }[]>`
          SELECT l.id, l."createdAt" AS at, l.message,
                 COALESCE(l.metadata->>'field', '') AS field,
                 COALESCE(l.metadata->>'severity', '') AS severity
          FROM logs l
          WHERE l.action = 'wa_account' AND ${inPeriod}
          ORDER BY l."createdAt" DESC
          LIMIT 100
        `,
  ]);

  const bot = { ...aggregateBotRows(botRows), avgQualifyMinutes: medianMsToMinutes(qualifyRows[0]?.median) };

  const autoNotify: ChatbotAnalytics['autoNotify'] = {
    ...foldAutoNotifyRows(autoRows),
    failures: failureRows.map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      contactName: r.contactName,
      authorName: r.authorName,
      reason: normalizeAutoNotifyFailReason(r.reason, r.message),
      source: r.source,
    })),
  };

  const activity: ChatbotActivityItem[] = activityRows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    authorName: r.authorName,
    action: r.action,
    message: r.message,
    contactName: r.contactName,
  }));

  const accountEvents: MetaAccountEvent[] = accountRows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    message: r.message,
    field: r.field,
    severity: accountEventSeverity(r.severity),
  }));

  return { periodDays: seriesDays, bot, autoNotify, activity, accountEvents };
}

/**
 * Origem dos leads (Click-to-WhatsApp): contatos novos do período por
 * plataforma e por anúncio, com o desfecho de cada lead e a série diária.
 * Separada do getChatbotAnalytics em 25/09/2026 — não toca em logs.
 */
export async function getLeadOrigins(
  periodDays: 7 | 30 | 90 = 7,
  numberId: string | null = null,
  fromISO?: string,
  toISO?: string,
): Promise<LeadOriginsData> {
  await requireChatbotDashboard();
  const { since, until, seriesDays, seriesUntil } = resolveWindow(periodDays, fromISO, toISO);
  const createdIn = until ? { gte: since, lte: until } : { gte: since };
  // Contatos têm numberId (indexado); null = todos os números.
  const numberFilter = numberId ? { numberId } : {};

  // Contatos novos do período — base da atribuição de origem (CTWA ads).
  // Só contatos que MANDARAM mensagem (optInSource=inbound): os avisos de
  // progresso do kanban criam contatos "fantasma" a partir do telefone do
  // card, e esses não são leads (o cliente nunca escreveu).
  const newContacts = await db.whatsAppContact.findMany({
    where: { createdAt: createdIn, optInSource: 'inbound', ...numberFilter },
    select: { id: true, adPlatform: true, adHeadline: true, adSourceId: true, adSourceUrl: true, createdAt: true },
  });

  // Desfecho de cada lead novo (qualificado / não qualificado / em andamento)
  // — é o que liga a campanha ao RESULTADO, não só ao volume.
  // Mesma régua do Funil do bot (14/09/2026): qualificado = tag "Qualificada"
  // (ou qualified/closeCategory); não qualificado = SÓ nao_qualificado/nq_*;
  // outros desfechos (sem resposta, perguntas, descartado...) ficam em
  // "other" em vez de inflar os não qualificados.
  const leadConversations = await db.whatsAppConversation.findMany({
    where: { contactId: { in: newContacts.map((c) => c.id) } },
    select: {
      contactId: true, status: true, qualified: true, closeCategory: true,
      tags: { select: { tag: { select: { name: true } } } },
    },
  });
  const outcomeByContact = new Map(leadConversations.map((c) => [c.contactId, c]));
  const outcomeOf = (contactId: string): 'qualified' | 'disqualified' | 'other' | 'pending' => {
    const conv = outcomeByContact.get(contactId);
    if (!conv) return 'pending';
    if (conv.qualified === true || conv.closeCategory === 'qualificado' || conv.tags.some((t) => t.tag.name === 'Qualificada')) return 'qualified';
    if (conv.status !== 'closed') return 'pending';
    if (conv.closeCategory === 'nao_qualificado' || conv.closeCategory?.startsWith('nq_')) return 'disqualified';
    return 'other';
  };

  // Agrupa origem dos leads: por plataforma e por anúncio individual.
  // Série diária: um ponto por dia do período (dias sem lead entram zerados,
  // senão o gráfico "pula" a data e a queda fica invisível).
  const dailyMap = new Map<string, AdOriginsData['daily'][number]>();
  for (const key of brDayKeySeries(seriesDays, seriesUntil)) {
    dailyMap.set(key, {
      date: key,
      label: brLabelFromKey(key),
      total: 0, facebook: 0, instagram: 0, meta: 0, organic: 0,
    });
  }

  const adOrigins: AdOriginsData = {
    byPlatform: {},
    byAd: [],
    outcomesByPlatform: {},
    daily: [],
    totalNewContacts: newContacts.length,
  };
  const adKeyMap = new Map<string, AdOriginsData['byAd'][number]>();
  for (const c of newContacts) {
    const platform = c.adPlatform ?? 'organic';
    adOrigins.byPlatform[platform] = (adOrigins.byPlatform[platform] ?? 0) + 1;

    const outcome = outcomeOf(c.id);
    const platOutcome = adOrigins.outcomesByPlatform[platform]
      ?? (adOrigins.outcomesByPlatform[platform] = { qualified: 0, disqualified: 0, other: 0, pending: 0 });
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
        qualified: 0, disqualified: 0, other: 0, pending: 0,
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

  return { periodDays: seriesDays, adOrigins };
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
  await requireChatbotDashboard();

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
  // (os logs não têm coluna numberId — mesma regra do JOIN por contactId do
  // getChatbotAnalytics; este funil não tem uso na UI e segue em JS).
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
  outcome: 'qualified' | 'disqualified' | 'other' | 'pending';
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
  await requireChatbotDashboard();

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
      select: {
        contactId: true, status: true, qualified: true, closeCategory: true,
        tags: { select: { tag: { select: { name: true } } } },
      },
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
    const qualified = conv?.qualified === true || conv?.closeCategory === 'qualificado'
      || !!conv?.tags.some((t) => t.tag.name === 'Qualificada');
    const closed = conv?.status === 'closed';
    const nq = conv?.closeCategory === 'nao_qualificado' || !!conv?.closeCategory?.startsWith('nq_');
    const outcome: AdLeadOutcome['outcome'] = qualified ? 'qualified' : !closed ? 'pending' : nq ? 'disqualified' : 'other';
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

'use server';

import { db } from '@/app/_shared/lib/prisma';
import { requirePermission } from '@/app/_shared/lib/permissions-server';
import type { PlaybookSection } from '@/app/_shared/lib/whatsapp/distill';

// MÉTRICAS DAS REGRAS APRENDIDAS — alimenta a aba "Métricas" da Revisão da IA.
//
// Junta três fontes:
//   1. WhatsAppRuleEvent kind="rule"     → cada vez que a IA declarou ter usado
//      uma regra do playbook numa resposta real.
//   2. WhatsAppRuleEvent kind="followup" → decisões contextuais do cron
//      (cutucar vs encerrar em silêncio).
//   3. WhatsAppPlaybook publicado        → texto/peso/proveniência das regras;
//      sourceReviewIds liga a regra às revisões (e conversas) que a geraram.

const RECENT_EVENTS_PER_RULE = 8;

export interface RuleSourceReview {
  reviewId: string;
  contactName: string | null;
  lesson: string | null;
  verdict: string | null;
  reviewedAt: string | null;
}

export interface RuleEventItem {
  contactId: string;
  contactName: string | null;
  botState: string | null;
  action: string | null;
  detail: string | null;
  createdAt: string;
}

export interface RuleMetric {
  ruleId: string;
  text: string;
  section: string;
  weight: number;
  states: string[];
  usesTotal: number;
  uses7d: number;
  uses30d: number;
  distinctContacts: number;
  lastUsedAt: string | null;
  // Distribuição das ações das decisões em que a regra pesou.
  actions: Record<string, number>;
  recentEvents: RuleEventItem[];
  sources: RuleSourceReview[];
}

export interface FollowupMetrics {
  total: number;
  nudges: number;
  closes: number;
  last7d: number;
  recent: RuleEventItem[];
}

/** Travas de código que sobrescreveram a decisão da IA (kind="code"). */
export interface CodeInterventionMetrics {
  total: number;
  last7d: number;
  recent: RuleEventItem[];
}

export interface RuleMetricsPayload {
  playbookVersion: number | null;
  publishedAt: string | null;
  rulesCount: number;
  // Totais gerais
  eventsTotal: number;
  events7d: number;
  events30d: number;
  rulesUsed7d: number;
  rulesNeverUsed: number;
  rules: RuleMetric[];
  followup: FollowupMetrics;
  code: CodeInterventionMetrics;
}

export async function getRuleMetrics(): Promise<RuleMetricsPayload> {
  await requirePermission('review_ai');

  const now = Date.now();
  const d7 = new Date(now - 7 * 24 * 60 * 60_000);
  const d30 = new Date(now - 30 * 24 * 60 * 60_000);

  const [published, ruleEvents, followupEvents, codeEvents] = await Promise.all([
    db.whatsAppPlaybook.findFirst({
      where: { status: 'publicado' },
      orderBy: { version: 'desc' },
      select: { version: true, publishedAt: true, sections: true },
    }),
    db.whatsAppRuleEvent.findMany({
      where: { kind: 'rule' },
      orderBy: { createdAt: 'desc' },
      take: 3000, // teto de sanidade; a janela de análise é 30d de qualquer forma
      select: {
        ruleId: true, ruleText: true, section: true, playbookVersion: true,
        contactId: true, contactName: true, botState: true, action: true,
        detail: true, createdAt: true,
      },
    }),
    db.whatsAppRuleEvent.findMany({
      where: { kind: 'followup' },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        contactId: true, contactName: true, botState: true, action: true,
        detail: true, createdAt: true,
      },
    }),
    db.whatsAppRuleEvent.findMany({
      where: { kind: 'code' },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: {
        contactId: true, contactName: true, botState: true, action: true,
        detail: true, createdAt: true,
      },
    }),
  ]);

  // ---- Regras da versão publicada (numeração R1..Rn, mesma do prompt) -------
  const sections = (published?.sections as unknown as PlaybookSection[]) ?? [];
  const ruleDefs: { ruleId: string; text: string; section: string; weight: number; states: string[]; sourceReviewIds: string[] }[] = [];
  let seq = 0;
  for (const s of sections) {
    for (const r of s.rules ?? []) {
      ruleDefs.push({
        ruleId: `R${++seq}`,
        text: r.text,
        section: s.name,
        weight: r.weight ?? 1,
        states: r.states ?? [],
        sourceReviewIds: r.sourceReviewIds ?? [],
      });
    }
  }

  // ---- Reviews de origem (proveniência) --------------------------------------
  const allSourceIds = [...new Set(ruleDefs.flatMap((r) => r.sourceReviewIds))];
  const sourceReviews = allSourceIds.length
    ? await db.whatsAppReview.findMany({
        where: { id: { in: allSourceIds } },
        select: { id: true, contactName: true, lesson: true, verdict: true, reviewedAt: true },
      })
    : [];
  const reviewById = new Map(sourceReviews.map((r) => [r.id, r]));

  // ---- Agrega eventos por regra ----------------------------------------------
  // Eventos de versões antigas do playbook entram pela CHAVE ruleId apenas se a
  // versão bate — senão são agrupados no texto que carregam (snapshot), evitando
  // atribuir uso da antiga R3 à nova R3, que pode ser outra regra.
  type Agg = {
    usesTotal: number; uses7d: number; uses30d: number;
    contacts: Set<string>; lastUsedAt: Date | null;
    actions: Record<string, number>; recent: RuleEventItem[];
  };
  const emptyAgg = (): Agg => ({
    usesTotal: 0, uses7d: 0, uses30d: 0,
    contacts: new Set(), lastUsedAt: null, actions: {}, recent: [],
  });
  const byRule = new Map<string, Agg>();

  for (const e of ruleEvents) {
    // Confia no ruleId SÓ quando o texto-snapshot do evento ainda é o texto da
    // regra que ocupa aquele ID hoje. Editar/excluir regra publicada RENUMERA
    // R1..Rn sem mudar a versão — o critério antigo (comparar versão) atribuía
    // o histórico das regras seguintes à regra errada. Texto divergente →
    // agrupa pelo snapshot; regras renumeradas são reencontradas pelo texto no
    // merge logo abaixo.
    const matchesText = ruleDefs.find((d) => d.ruleId === e.ruleId)?.text === e.ruleText;
    const key = matchesText && e.ruleId ? e.ruleId : `txt:${e.ruleText ?? '?'}`;
    const agg = byRule.get(key) ?? emptyAgg();
    agg.usesTotal++;
    if (e.createdAt >= d7) agg.uses7d++;
    if (e.createdAt >= d30) agg.uses30d++;
    agg.contacts.add(e.contactId);
    if (!agg.lastUsedAt || e.createdAt > agg.lastUsedAt) agg.lastUsedAt = e.createdAt;
    if (e.action) agg.actions[e.action] = (agg.actions[e.action] ?? 0) + 1;
    if (agg.recent.length < RECENT_EVENTS_PER_RULE) {
      agg.recent.push({
        contactId: e.contactId,
        contactName: e.contactName,
        botState: e.botState,
        action: e.action,
        detail: e.detail,
        createdAt: e.createdAt.toISOString(),
      });
    }
    byRule.set(key, agg);
  }

  // Reencontra pelo TEXTO o histórico de eventos gravados antes de uma
  // renumeração (o snapshot ruleText é a identidade estável da regra).
  const mergeAgg = (a: Agg, b: Agg | undefined): Agg => {
    if (!b) return a;
    const actions = { ...a.actions };
    for (const [k, v] of Object.entries(b.actions)) actions[k] = (actions[k] ?? 0) + v;
    return {
      usesTotal: a.usesTotal + b.usesTotal,
      uses7d: a.uses7d + b.uses7d,
      uses30d: a.uses30d + b.uses30d,
      contacts: new Set([...a.contacts, ...b.contacts]),
      lastUsedAt:
        !a.lastUsedAt ? b.lastUsedAt
        : !b.lastUsedAt ? a.lastUsedAt
        : a.lastUsedAt > b.lastUsedAt ? a.lastUsedAt : b.lastUsedAt,
      actions,
      recent: [...a.recent, ...b.recent]
        .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
        .slice(0, RECENT_EVENTS_PER_RULE),
    };
  };

  const rules: RuleMetric[] = ruleDefs.map((def) => {
    const agg = mergeAgg(byRule.get(def.ruleId) ?? emptyAgg(), byRule.get(`txt:${def.text}`));
    return {
      ruleId: def.ruleId,
      text: def.text,
      section: def.section,
      weight: def.weight,
      states: def.states,
      usesTotal: agg.usesTotal,
      uses7d: agg.uses7d,
      uses30d: agg.uses30d,
      distinctContacts: agg.contacts.size,
      lastUsedAt: agg.lastUsedAt ? agg.lastUsedAt.toISOString() : null,
      actions: agg.actions,
      recentEvents: agg.recent,
      sources: def.sourceReviewIds
        .map((id) => reviewById.get(id))
        .filter((r): r is NonNullable<typeof r> => !!r)
        .map((r) => ({
          reviewId: r.id,
          contactName: r.contactName,
          lesson: r.lesson,
          verdict: r.verdict,
          reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
        })),
    };
  });
  // Mais usadas primeiro; empate → maior peso.
  rules.sort((a, b) => b.usesTotal - a.usesTotal || b.weight - a.weight);

  const followup: FollowupMetrics = {
    total: followupEvents.length,
    nudges: followupEvents.filter((e) => e.action === 'nudge').length,
    closes: followupEvents.filter((e) => e.action === 'close').length,
    last7d: followupEvents.filter((e) => e.createdAt >= d7).length,
    recent: followupEvents.slice(0, 12).map((e) => ({
      contactId: e.contactId,
      contactName: e.contactName,
      botState: e.botState,
      action: e.action,
      detail: e.detail,
      createdAt: e.createdAt.toISOString(),
    })),
  };

  return {
    playbookVersion: published?.version ?? null,
    publishedAt: published?.publishedAt ? published.publishedAt.toISOString() : null,
    rulesCount: ruleDefs.length,
    eventsTotal: ruleEvents.length,
    events7d: ruleEvents.filter((e) => e.createdAt >= d7).length,
    events30d: ruleEvents.filter((e) => e.createdAt >= d30).length,
    rulesUsed7d: rules.filter((r) => r.uses7d > 0).length,
    rulesNeverUsed: rules.filter((r) => r.usesTotal === 0).length,
    rules,
    followup,
    code: {
      total: codeEvents.length,
      last7d: codeEvents.filter((e) => e.createdAt >= d7).length,
      recent: codeEvents.slice(0, 12).map((e) => ({
        contactId: e.contactId,
        contactName: e.contactName,
        botState: e.botState,
        action: e.action,
        detail: e.detail,
        createdAt: e.createdAt.toISOString(),
      })),
    },
  };
}

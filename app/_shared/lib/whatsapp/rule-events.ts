import { db } from '@/app/_shared/lib/prisma';
import type { PlaybookSection } from './distill';

// TELEMETRIA DO PLAYBOOK — grava um WhatsAppRuleEvent cada vez que a IA declara
// (campo appliedRules do /reply) que uma regra aprendida influenciou a resposta,
// e cada decisão contextual de follow-up do cron (nudge/close).
//
// Tudo aqui é best-effort: telemetria NUNCA pode derrubar o atendimento. Falhou,
// loga e segue.

/**
 * Numeração R1..Rn — MESMA convenção do renderPlaybook do microserviço
 * (bot.js): percorre seções na ordem, regras na ordem, contador global. Se
 * mudar lá, mude aqui — é o contrato que traduz o ID citado pela IA de volta
 * para o texto/seção da regra.
 */
function flattenRules(sections: PlaybookSection[]): Map<string, { text: string; section: string }> {
  const map = new Map<string, { text: string; section: string }>();
  let seq = 0;
  for (const s of sections) {
    for (const r of s.rules ?? []) {
      map.set(`R${++seq}`, { text: r.text, section: s.name });
    }
  }
  return map;
}

// Cache do playbook publicado (5 min): o webhook processa mensagem a mensagem e
// não precisa reler o banco a cada resposta — a versão só muda ao publicar.
let playbookCache: {
  fetchedAt: number;
  version: number | null;
  rules: Map<string, { text: string; section: string }>;
} | null = null;
const PLAYBOOK_CACHE_MS = 5 * 60_000;

/**
 * Derruba o cache na hora em que o playbook publicado muda (publish, edição ou
 * exclusão de regra) — sem isto, eventos gravados na janela de até 5min usavam
 * a numeração/texto antigos. Vale só para a instância atual do serverless; as
 * demais expiram pelo TTL, e o matching por texto nas métricas cobre o resto.
 */
export function invalidatePlaybookCache(): void {
  playbookCache = null;
}

async function getPublishedRules(): Promise<{ version: number | null; rules: Map<string, { text: string; section: string }> }> {
  if (playbookCache && Date.now() - playbookCache.fetchedAt < PLAYBOOK_CACHE_MS) {
    return playbookCache;
  }
  const published = await db.whatsAppPlaybook.findFirst({
    where: { status: 'publicado' },
    orderBy: { version: 'desc' },
    select: { version: true, sections: true },
  });
  playbookCache = {
    fetchedAt: Date.now(),
    version: published?.version ?? null,
    rules: published ? flattenRules(published.sections as unknown as PlaybookSection[]) : new Map(),
  };
  return playbookCache;
}

/**
 * Registra as regras que a IA declarou ter aplicado numa resposta. IDs que não
 * existem na versão publicada (alucinação ou corrida com uma publicação nova)
 * são descartados em silêncio.
 */
export async function recordAppliedRules(args: {
  appliedRules: string[] | undefined;
  contactId: string;
  contactName: string | null;
  botState: string | null;
  action: string;
  replyText: string | null;
}): Promise<void> {
  try {
    const ids = args.appliedRules ?? [];
    if (!ids.length) return;
    const { version, rules } = await getPublishedRules();
    const rows = ids
      .map((id) => ({ id, rule: rules.get(id) }))
      .filter((x): x is { id: string; rule: { text: string; section: string } } => !!x.rule)
      .map(({ id, rule }) => ({
        kind: 'rule',
        ruleId: id,
        ruleText: rule.text,
        section: rule.section,
        playbookVersion: version,
        contactId: args.contactId,
        contactName: args.contactName,
        botState: args.botState,
        action: args.action,
        detail: args.replyText ? args.replyText.slice(0, 500) : null,
      }));
    if (rows.length) await db.whatsAppRuleEvent.createMany({ data: rows });
  } catch (err) {
    console.error('[WA RULES] Falha ao registrar regras aplicadas (telemetria, seguindo):', err);
  }
}

/**
 * Registra uma INTERVENÇÃO DE CÓDIGO: momentos em que uma trava do app
 * sobrescreve a decisão da IA (ex.: loop "não entendi 2x" → especialista).
 * Aparece na dash separada das regras — o que o código faz NÃO conta como
 * "playbook funcionando", e sem esse registro a intervenção fica invisível
 * (regra fantasma: o comportamento parece da IA, mas não foi dela).
 */
export async function recordCodeIntervention(args: {
  contactId: string;
  contactName: string | null;
  botState: string | null;
  action: string;
  detail: string;
}): Promise<void> {
  try {
    await db.whatsAppRuleEvent.create({
      data: {
        kind: 'code',
        contactId: args.contactId,
        contactName: args.contactName,
        botState: args.botState,
        action: args.action,
        detail: args.detail.slice(0, 500),
      },
    });
  } catch (err) {
    console.error('[WA RULES] Falha ao registrar intervenção de código (telemetria, seguindo):', err);
  }
}

/**
 * Registra a decisão contextual de follow-up do cron (nudge ou close) — aparece
 * na mesma dash, como prova de que a IA "entendeu o contexto" do silêncio.
 */
export async function recordFollowupDecision(args: {
  contactId: string;
  contactName: string | null;
  botState: string | null;
  action: 'nudge' | 'close';
  detail: string | null;
}): Promise<void> {
  try {
    await db.whatsAppRuleEvent.create({
      data: {
        kind: 'followup',
        contactId: args.contactId,
        contactName: args.contactName,
        botState: args.botState,
        action: args.action,
        detail: args.detail ? args.detail.slice(0, 500) : null,
      },
    });
  } catch (err) {
    console.error('[WA RULES] Falha ao registrar decisão de follow-up (telemetria, seguindo):', err);
  }
}

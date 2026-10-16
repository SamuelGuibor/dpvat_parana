'use server';

import Anthropic from '@anthropic-ai/sdk';
import { db } from '@/app/_shared/lib/prisma';
import { requirePermission } from '@/app/_shared/lib/permissions-server';
import { logWhatsAppEvent } from '@/app/_shared/lib/log';
import { publishPlaybook, type PlaybookSection } from '@/app/_shared/lib/whatsapp/distill';
import { captureConversation } from '@/app/_shared/lib/whatsapp/brain';
import { maskSecretsInSequence } from '@/app/_shared/utils/mask-secrets';
import { closingJudgeTranscript } from '@/app/_shared/utils/closing-judge';
import { brDateTimeParts, brDayLabel } from '@/app/_shared/utils/date-br';
import {
  TEACH_SECTION, TEACH_SYSTEM, locateRule, numberRules, parseTeachAnalysis, teachUserPrompt,
  type TeachAnalysis, type TeachKind,
} from '@/app/_shared/utils/teach-brain';

// "Ensinar o cérebro" do Copiloto. Regras puras e prompt em
// utils/teach-brain.ts. Guard próprio (teach_bot), separado da Revisão da IA:
// quem atende a conversa ensina sem ir à fila de revisão.

const TEACH_MODEL = 'claude-sonnet-5';
const TEACH_HISTORY = 40;
const TEACH_DECISIONS = 20;
const TEACH_TIMEOUT_MS = 60_000;
const MAX_RULES = 80; // mesmo teto do distill.ts

export interface TeachDecision {
  at: string;
  outcome: string | null;
  appliedRules: string[] | null; // null = micro antigo, sem o campo
}

export interface TeachResult {
  analysis: TeachAnalysis;
  decisions: TeachDecision[];
  playbookVersion: number | null;
}

function brStamp(d: Date): string {
  return `${brDayLabel(d)} ${brDateTimeParts(d).time}`;
}

export async function analyzeBrainTeaching(input: {
  contactId: string;
  request: string;
  kind: TeachKind;
}): Promise<TeachResult> {
  const me = await requirePermission('teach_bot');
  const request = input.request.trim();
  if (request.length < 8) throw new Error('Descreva a regra com um pouco mais de detalhe.');
  if (!process.env.CLAUDE_API_KEY) throw new Error('IA indisponível (sem chave configurada).');

  const contact = await db.whatsAppContact.findUnique({
    where: { id: input.contactId },
    select: { id: true, name: true, phone: true, numberId: true },
  });
  if (!contact) throw new Error('Conversa não encontrada.');

  const [pb, recent, logs] = await Promise.all([
    db.whatsAppPlaybook.findFirst({ where: { status: 'publicado' }, orderBy: { version: 'desc' } }),
    db.whatsAppMessage.findMany({
      where: { contactId: contact.id, internal: false, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: TEACH_HISTORY,
      select: { direction: true, sentByBot: true, body: true, mediaType: true, createdAt: true },
    }),
    db.log.findMany({
      where: { action: 'wa_bot', metadata: { path: ['contactId'], equals: contact.id } },
      orderBy: { createdAt: 'desc' },
      take: TEACH_DECISIONS,
      select: { createdAt: true, metadata: true },
    }),
  ]);

  const rules = numberRules((pb?.sections as unknown as PlaybookSection[] | undefined) ?? []);
  const messages = recent.reverse();
  // Senha e código nunca vão a IA nenhuma (mask-secrets.ts).
  const texts = maskSecretsInSequence(messages.map((m) => (m.body ?? '').trim()))
    .map((t, i) => t || (messages[i].mediaType ? `[anexo: ${messages[i].mediaType}]` : '[mensagem vazia]'));

  const decisions: TeachDecision[] = logs.reverse().map((l) => {
    const m = (l.metadata ?? {}) as Record<string, unknown>;
    return {
      at: brStamp(l.createdAt),
      outcome: typeof m.outcome === 'string' ? m.outcome : null,
      appliedRules: Array.isArray(m.appliedRules) ? m.appliedRules.map(String) : null,
    };
  });
  const decisionsText = decisions
    .map((d) => `[${d.at}] ${d.outcome ?? 'decisão'} · regras citadas: ${
      d.appliedRules === null ? '(não informado)' : d.appliedRules.length ? d.appliedRules.join(', ') : 'nenhuma'}`)
    .join('\n');

  let usage: Record<string, unknown> | undefined;
  const t0 = Date.now();
  const log = (message: string, metadata: Record<string, unknown>) =>
    logWhatsAppEvent({
      action: 'wa_teach_brain',
      message,
      authorId: me.userId,
      authorName: me.name ?? me.email ?? 'Equipe',
      contactId: contact.id,
      numberId: contact.numberId,
      contactName: contact.name,
      contactPhone: contact.phone,
      metadata: { mode: 'analyze', usage, durationMs: Date.now() - t0, kind: input.kind, request, ...metadata },
    });

  try {
    const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY, timeout: TEACH_TIMEOUT_MS, maxRetries: 0 });
    const response = await client.messages.create({
      model: TEACH_MODEL,
      // 2000 cortava o JSON no meio (16/10: 3 análises seguidas paradas em 2000 tokens).
      max_tokens: 8000,
      system: TEACH_SYSTEM,
      messages: [{
        role: 'user',
        content: teachUserPrompt({
          kind: input.kind, request, rules, decisions: decisionsText,
          transcript: closingJudgeTranscript(messages, texts),
        }),
      }],
    });
    usage = {
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    };
    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const analysis = parseTeachAnalysis(raw, rules);
    if (!analysis) {
      await log('Ensinar o cérebro: resposta da IA ilegível', { error: 'formato' });
      throw new Error('A IA não devolveu uma análise legível. Tente de novo.');
    }
    await log(`Ensinar o cérebro: IA recomendou "${analysis.recommendation}"`, {
      recommendation: analysis.recommendation,
      targetRuleId: analysis.targetRuleId ?? null,
      playbookVersion: pb?.version ?? null,
    });
    return { analysis, decisions, playbookVersion: pb?.version ?? null };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('A IA não devolveu')) throw err;
    await log('Ensinar o cérebro: falha na IA', { error: err instanceof Error ? err.message : String(err) });
    throw new Error('Não foi possível analisar agora. Tente de novo em instantes.');
  }
}

/**
 * Aplica o que o atendente escolheu no popup:
 *  - reforcar: reescreve a regra existente e republica (numeração intacta);
 *  - nova: acrescenta a regra no FIM do playbook — inserir no meio renumeraria
 *    as regras seguintes e quebraria a leitura do appliedRules dos logs antigos;
 *  - fila: só registra na fila da Revisão da IA, com o pedido como comentário.
 */
export async function applyBrainTeaching(input: {
  contactId: string;
  mode: 'reforcar' | 'nova' | 'fila';
  text: string;
  request: string;
  targetRuleId?: string;
  playbookVersion: number | null;
}): Promise<{ message: string }> {
  const me = await requirePermission('teach_bot');
  const by = me.name ?? me.email ?? 'Equipe';
  const text = input.text.trim();

  const contact = await db.whatsAppContact.findUnique({
    where: { id: input.contactId },
    select: { id: true, name: true, phone: true, numberId: true },
  });
  if (!contact) throw new Error('Conversa não encontrada.');
  const log = (message: string, metadata: Record<string, unknown>) =>
    logWhatsAppEvent({
      action: 'wa_teach_brain',
      message,
      authorId: me.userId,
      authorName: by,
      contactId: contact.id,
      numberId: contact.numberId,
      contactName: contact.name,
      contactPhone: contact.phone,
      metadata: { mode: input.mode, request: input.request, text, ...metadata },
    });

  if (input.mode === 'fila') {
    const reviewId = await captureConversation(contact.id, 'manual');
    if (!reviewId) throw new Error('Não foi possível registrar na fila de revisão.');
    await db.whatsAppReview.update({
      where: { id: reviewId },
      data: { comment: [`Pedido do inbox (${by}): ${input.request}`, text && `Proposta: ${text}`].filter(Boolean).join('\n') },
    });
    await log('Ensinar o cérebro: enviado à fila da Revisão da IA', { reviewId });
    return { message: 'Enviado à fila da Revisão da IA.' };
  }

  if (!text) throw new Error('A regra não pode ficar vazia.');
  const pb = await db.whatsAppPlaybook.findFirst({ where: { status: 'publicado' }, orderBy: { version: 'desc' } });
  if (!pb) throw new Error('Nenhum playbook publicado. Publique um pela Revisão da IA primeiro.');
  // A análise citou ids de uma versão; se outra foi publicada no meio, o R#
  // pode apontar para outra regra.
  if (input.playbookVersion !== pb.version) {
    throw new Error('O playbook mudou desde a análise. Analise de novo antes de publicar.');
  }
  const sections = (pb.sections as unknown as PlaybookSection[]).filter((s) => s.rules?.length);

  let message: string;
  if (input.mode === 'reforcar') {
    const pos = input.targetRuleId ? locateRule(sections, input.targetRuleId) : null;
    if (!pos) throw new Error('Regra não encontrada no playbook publicado.');
    const rule = sections[pos.sectionIndex].rules[pos.ruleIndex];
    sections[pos.sectionIndex].rules[pos.ruleIndex] = { ...rule, text };
    message = `${input.targetRuleId} reforçada e publicada.`;
  } else {
    if (numberRules(sections).length >= MAX_RULES) {
      throw new Error(`O playbook já tem ${MAX_RULES} regras. Reforce uma existente ou consolide pela Revisão da IA.`);
    }
    const last = sections[sections.length - 1];
    if (last?.name === TEACH_SECTION) last.rules.push({ text, weight: 1, states: [] });
    else sections.push({ name: TEACH_SECTION, rules: [{ text, weight: 1, states: [] }] });
    message = `Regra R${numberRules(sections).length} criada e publicada.`;
  }

  await db.whatsAppPlaybook.update({
    where: { id: pb.id },
    data: { sections: sections as unknown as object, rulesCount: numberRules(sections).length },
  });
  // Publicado → S3 + cache do bot precisam refletir já (mesmo caminho do editar regra).
  await publishPlaybook(pb.id, by, true);
  await log(`Ensinar o cérebro: ${message}`, { targetRuleId: input.targetRuleId ?? null, playbookVersion: pb.version });
  return { message };
}

'use server';

import { requirePermission } from '@/app/_shared/lib/permissions-server';
import { analyzeTeaching, applyTeaching, type TeachResult } from '@/app/_shared/lib/whatsapp/teach-brain-core';
import type { TeachKind } from '@/app/_shared/utils/teach-brain';

// "Ensinar o cérebro" do Copiloto. Núcleo em lib/whatsapp/teach-brain-core.ts
// (o mesmo das ferramentas da IA de operação, op/tools/cerebro-bot.ts); regras
// puras e prompt em utils/teach-brain.ts. Guard próprio (teach_bot), separado
// da Revisão da IA: quem atende a conversa ensina sem ir à fila de revisão.

export type { TeachDecision, TeachResult } from '@/app/_shared/lib/whatsapp/teach-brain-core';

export async function analyzeBrainTeaching(input: {
  contactId: string;
  request: string;
  kind: TeachKind;
}): Promise<TeachResult> {
  const me = await requirePermission('teach_bot');
  return analyzeTeaching({ ...input, author: { id: me.userId, name: me.name ?? me.email ?? 'Equipe' } });
}

/**
 * Aplica o que o atendente escolheu no popup (reforcar · nova · fila); regras
 * de cada modo no applyTeaching.
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
  const { message } = await applyTeaching({ ...input, author: { id: me.userId, name: me.name ?? me.email ?? 'Equipe' } });
  return { message };
}

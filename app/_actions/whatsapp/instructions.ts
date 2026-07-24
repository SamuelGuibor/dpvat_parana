'use server';

import { db } from '@/app/_shared/lib/prisma';
import { requirePermission } from '@/app/_shared/lib/permissions-server';
import {
  publishInstructions, renderInstructions, charCountOf, sectionId,
  type InstructionSection,
} from '@/app/_shared/lib/whatsapp/instructions';
import { logWhatsAppEvent } from '@/app/_shared/lib/log';

// Edição das INSTRUÇÕES BASE do bot pela tela.
//
// Modelo de trabalho: existe no máximo UM rascunho por vez. Editar qualquer
// coisa cria (ou reaproveita) esse rascunho a partir da versão publicada — a
// publicada nunca é alterada no lugar. Assim o bot em produção nunca muda de
// comportamento no meio de uma edição sua.

export interface InstructionsVersion {
  id: string;
  version: number;
  intro: string;
  sections: InstructionSection[];
  status: string;
  changeNote: string | null;
  charCount: number;
  publishedAt: string | null;
  createdAt: string;
}

function map(p: {
  id: string; version: number; intro: string; sections: unknown; status: string;
  changeNote: string | null; charCount: number; publishedAt: Date | null; createdAt: Date;
}): InstructionsVersion {
  return {
    id: p.id,
    version: p.version,
    intro: p.intro,
    sections: ((p.sections as InstructionSection[]) ?? []).sort((a, b) => a.order - b.order),
    status: p.status,
    changeNote: p.changeNote,
    charCount: p.charCount,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function getInstructionsState(): Promise<{
  published: InstructionsVersion | null;
  draft: InstructionsVersion | null;
}> {
  await requirePermission('review_ai');
  const [published, draft] = await Promise.all([
    db.whatsAppInstructions.findFirst({ where: { status: 'publicado' }, orderBy: { version: 'desc' } }),
    db.whatsAppInstructions.findFirst({ where: { status: 'rascunho' }, orderBy: { version: 'desc' } }),
  ]);
  return {
    published: published ? map(published) : null,
    draft: draft ? map(draft) : null,
  };
}

/**
 * Devolve o rascunho editável, criando-o a partir da versão publicada na
 * primeira edição. Nunca mexe na publicada.
 */
async function ensureDraft() {
  const draft = await db.whatsAppInstructions.findFirst({
    where: { status: 'rascunho' },
    orderBy: { version: 'desc' },
  });
  if (draft) return draft;

  const published = await db.whatsAppInstructions.findFirst({
    where: { status: 'publicado' },
    orderBy: { version: 'desc' },
  });
  const last = await db.whatsAppInstructions.findFirst({
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  return db.whatsAppInstructions.create({
    data: {
      version: (last?.version ?? 0) + 1,
      intro: published?.intro ?? '',
      sections: (published?.sections as object) ?? [],
      status: 'rascunho',
      charCount: published?.charCount ?? 0,
    },
  });
}

async function saveSections(sections: InstructionSection[], intro?: string) {
  const draft = await ensureDraft();
  const finalIntro = intro ?? draft.intro;
  // Reordena de 1..N para não deixar buracos depois de excluir/mover.
  const normalized = [...sections]
    .sort((a, b) => a.order - b.order)
    .map((s, i) => ({ ...s, order: i + 1 }));

  await db.whatsAppInstructions.update({
    where: { id: draft.id },
    data: {
      intro: finalIntro,
      sections: normalized as unknown as object,
      charCount: charCountOf(finalIntro, normalized),
    },
  });
}

/** Cria ou edita uma seção do rascunho. */
export async function upsertSection(input: {
  id?: string;
  title: string;
  content: string;
}): Promise<void> {
  await requirePermission('review_ai');
  if (!input.title.trim()) throw new Error('A seção precisa de um título.');

  const draft = await ensureDraft();
  const sections = ((draft.sections as unknown as InstructionSection[]) ?? []).slice();

  if (input.id) {
    const idx = sections.findIndex((s) => s.id === input.id);
    if (idx < 0) throw new Error('Seção não encontrada.');
    sections[idx] = { ...sections[idx], title: input.title.trim(), content: input.content };
  } else {
    let id = sectionId(input.title, sections.length);
    // Colisão de slug: sufixo numérico até ficar único.
    let n = 2;
    while (sections.some((s) => s.id === id)) id = `${sectionId(input.title, sections.length)}_${n++}`;
    sections.push({
      id,
      title: input.title.trim(),
      content: input.content,
      order: sections.length + 1,
      enabled: true,
    });
  }
  await saveSections(sections);
}

/** Exclui uma seção do rascunho. */
export async function deleteSection(id: string): Promise<void> {
  await requirePermission('review_ai');
  const draft = await ensureDraft();
  const sections = ((draft.sections as unknown as InstructionSection[]) ?? []).filter((s) => s.id !== id);
  await saveSections(sections);
}

/** Liga/desliga uma seção — sai do prompt sem perder o texto. */
export async function toggleSection(id: string, enabled: boolean): Promise<void> {
  await requirePermission('review_ai');
  const draft = await ensureDraft();
  const sections = ((draft.sections as unknown as InstructionSection[]) ?? []).map((s) =>
    s.id === id ? { ...s, enabled } : s,
  );
  await saveSections(sections);
}

/** Move uma seção para cima/baixo — a ordem muda o prompt. */
export async function moveSection(id: string, direction: 'up' | 'down'): Promise<void> {
  await requirePermission('review_ai');
  const draft = await ensureDraft();
  const sections = ((draft.sections as unknown as InstructionSection[]) ?? []).sort((a, b) => a.order - b.order);
  const idx = sections.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const swap = direction === 'up' ? idx - 1 : idx + 1;
  if (swap < 0 || swap >= sections.length) return;
  [sections[idx], sections[swap]] = [sections[swap], sections[idx]];
  await saveSections(sections.map((s, i) => ({ ...s, order: i + 1 })));
}

/** Edita o texto de abertura (identidade e tom do bot). */
export async function updateIntro(intro: string): Promise<void> {
  await requirePermission('review_ai');
  const draft = await ensureDraft();
  await saveSections((draft.sections as unknown as InstructionSection[]) ?? [], intro);
}

/** Publica o rascunho: o bot passa a usar estas instruções. */
export async function publishInstructionsDraft(changeNote: string): Promise<void> {
  const me = await requirePermission('review_ai');
  const draft = await db.whatsAppInstructions.findFirst({
    where: { status: 'rascunho' },
    orderBy: { version: 'desc' },
  });
  if (!draft) throw new Error('Não há rascunho para publicar.');

  await db.whatsAppInstructions.update({
    where: { id: draft.id },
    data: { changeNote: changeNote.trim() || null },
  });
  await publishInstructions(draft.id, me.name ?? me.email);

  await logWhatsAppEvent({
    action: 'wa_review',
    message: `publicou a versão ${draft.version} das instruções do bot`,
    authorId: me.userId,
    authorName: me.name ?? me.email,
    contactId: 'sistema',
    metadata: { version: draft.version, charCount: draft.charCount },
  });
}

/** Joga fora o rascunho e volta ao que está publicado. */
export async function discardInstructionsDraft(): Promise<void> {
  await requirePermission('review_ai');
  await db.whatsAppInstructions.updateMany({
    where: { status: 'rascunho' },
    data: { status: 'descartado' },
  });
}

/** Prévia exata do texto que vai para o modelo. */
export async function previewInstructions(): Promise<{ text: string; chars: number }> {
  await requirePermission('review_ai');
  const v =
    (await db.whatsAppInstructions.findFirst({ where: { status: 'rascunho' }, orderBy: { version: 'desc' } })) ??
    (await db.whatsAppInstructions.findFirst({ where: { status: 'publicado' }, orderBy: { version: 'desc' } }));
  if (!v) return { text: '', chars: 0 };
  const text = renderInstructions(v.intro, (v.sections as unknown as InstructionSection[]) ?? []);
  return { text, chars: text.length };
}

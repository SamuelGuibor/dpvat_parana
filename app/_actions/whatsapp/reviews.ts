'use server';

import { db } from '@/app/_shared/lib/prisma';
import { requirePermission } from '@/app/_shared/lib/permissions-server';
import { readSnapshot, type SnapshotTurn } from '@/app/_shared/lib/whatsapp/brain';
import { extractLesson, buildPlaybookDraft, publishPlaybook } from '@/app/_shared/lib/whatsapp/distill';
import { logWhatsAppEvent } from '@/app/_shared/lib/log';
import { REVIEW_VERDICTS, sanitizeErrorTags, type ReviewVerdict } from '@/app/_shared/lib/whatsapp/review-tags';

// Fila de revisão da IA (camada 2 do cérebro). Só quem tem a permissão
// "review_ai" entra aqui — hoje, apenas o ADMIN++.

const PAGE_SIZE = 30;

export interface ReviewListItem {
  id: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string;
  closeCategory: string | null;
  qualified: boolean | null;
  closedReason: string;
  messageCount: number;
  botOnly: boolean;
  status: string;
  verdict: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewerName: string | null;
}

export interface ReviewDetail extends ReviewListItem {
  comment: string | null;
  errorTags: string[];
  correctReply: string | null;
  /** Lição destilada pela IA a partir deste julgamento (null = nada a aprender). */
  lesson: string | null;
  lessonStates: string[];
  lessonSection: string | null;
  lessonEdited: boolean;
  /** true quando esta lição já foi absorvida por uma versão publicada. */
  distilled: boolean;
  /** Conteúdo do snapshot no S3. Null se o objeto sumiu ou o S3 falhou. */
  messages: SnapshotTurn[] | null;
  botMemory: string | null;
  botState: string | null;
  durationMs: number | null;
}

export type ReviewFilter = 'pendente' | 'revisado' | 'todos';

function toListItem(r: {
  id: string; contactId: string; contactName: string | null; contactPhone: string;
  closeCategory: string | null; qualified: boolean | null; closedReason: string;
  messageCount: number; botOnly: boolean; status: string; verdict: string | null;
  createdAt: Date; reviewedAt: Date | null; reviewerName: string | null;
}): ReviewListItem {
  return {
    id: r.id,
    contactId: r.contactId,
    contactName: r.contactName,
    contactPhone: r.contactPhone,
    closeCategory: r.closeCategory,
    qualified: r.qualified,
    closedReason: r.closedReason,
    messageCount: r.messageCount,
    botOnly: r.botOnly,
    status: r.status,
    verdict: r.verdict,
    createdAt: r.createdAt.toISOString(),
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewerName: r.reviewerName,
  };
}

/**
 * Fila de revisão. Sem amostragem nem priorização automática — a decisão foi
 * revisar tudo manualmente nos primeiros meses, então a ordem é simplesmente a
 * mais antiga primeiro (quem esperou mais aparece antes) nas pendentes, e a
 * mais recente primeiro no histórico já revisado.
 */
export async function listReviews(
  filter: ReviewFilter = 'pendente',
  page = 0,
): Promise<{ items: ReviewListItem[]; total: number; pending: number }> {
  await requirePermission('review_ai');

  const where = filter === 'todos' ? {} : { status: filter };

  const [rows, total, pending] = await Promise.all([
    db.whatsAppReview.findMany({
      where,
      orderBy: { createdAt: filter === 'pendente' ? 'asc' : 'desc' },
      skip: page * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, contactId: true, contactName: true, contactPhone: true,
        closeCategory: true, qualified: true, closedReason: true,
        messageCount: true, botOnly: true, status: true, verdict: true,
        createdAt: true, reviewedAt: true, reviewerName: true,
      },
    }),
    db.whatsAppReview.count({ where }),
    db.whatsAppReview.count({ where: { status: 'pendente' } }),
  ]);

  return { items: rows.map(toListItem), total, pending };
}

/** Abre uma conversa da fila: metadados do banco + thread lida do S3. */
export async function getReview(id: string): Promise<ReviewDetail | null> {
  await requirePermission('review_ai');

  const r = await db.whatsAppReview.findUnique({ where: { id } });
  if (!r) return null;

  const snapshot = await readSnapshot(r.s3Key);

  return {
    ...toListItem(r),
    comment: r.comment,
    errorTags: r.errorTags,
    correctReply: r.correctReply,
    lesson: r.lesson,
    lessonStates: r.lessonStates,
    lessonSection: r.lessonSection,
    lessonEdited: r.lessonEdited,
    distilled: !!r.distilledAt,
    messages: snapshot?.messages ?? null,
    botMemory: snapshot?.conversation.botMemory ?? null,
    botState: snapshot?.conversation.botState ?? null,
    durationMs: snapshot?.stats.durationMs ?? null,
  };
}

/**
 * Grava o julgamento. Reprovar/parcial EXIGE comentário: sem o "por quê" a
 * review não vira regra nenhuma na destilação — vira só um número. Aprovar é
 * um clique só, de propósito (senão a fila não anda).
 */
export async function submitReview(
  id: string,
  input: {
    verdict: ReviewVerdict;
    comment?: string;
    errorTags?: string[];
    correctReply?: string;
  },
): Promise<{ lesson: string; states: string[]; section: string } | null> {
  const me = await requirePermission('review_ai');

  if (!(REVIEW_VERDICTS as readonly string[]).includes(input.verdict)) {
    throw new Error('Veredito inválido.');
  }

  const comment = input.comment?.trim() || null;
  if (input.verdict !== 'aprovado' && !comment) {
    throw new Error('Explique o que faltou — é esse texto que vira regra para a IA.');
  }

  const review = await db.whatsAppReview.findUnique({
    where: { id },
    select: { contactId: true, contactName: true, contactPhone: true, distilledAt: true },
  });
  if (!review) throw new Error('Conversa não encontrada na fila.');

  await db.whatsAppReview.update({
    where: { id },
    data: {
      status: 'revisado',
      verdict: input.verdict,
      comment,
      errorTags: input.verdict === 'aprovado' ? [] : sanitizeErrorTags(input.errorTags),
      correctReply: input.correctReply?.trim() || null,
      reviewerId: me.userId,
      reviewerName: me.name ?? me.email,
      reviewedAt: new Date(),
      // Editar uma review já destilada precisa reabrir a destilação, senão o
      // playbook segue com a lição antiga.
      ...(review.distilledAt ? { distilledAt: null } : {}),
    },
  });

  await logWhatsAppEvent({
    action: 'wa_review',
    message: `revisou o atendimento de ${review.contactName ?? review.contactPhone}: ${input.verdict}`,
    authorId: me.userId,
    authorName: me.name ?? me.email,
    contactId: review.contactId,
    contactName: review.contactName,
    contactPhone: review.contactPhone,
    metadata: { verdict: input.verdict, errorTags: input.errorTags ?? [] },
  });

  // Destila a lição AGORA (não em background) para a tela poder mostrar "a IA
  // entendeu assim" e você corrigir na hora se ela leu errado — uma lição
  // mal-extraída envenena o playbook silenciosamente. Custa ~2s e é
  // best-effort: se a IA falhar, a revisão continua salva, sem lição.
  return extractLesson(id);
}

/**
 * Corrige o texto da lição extraída. Marca `lessonEdited` — o acúmulo dessas
 * correções é o sinal de que o prompt de destilação precisa de ajuste.
 */
export async function updateLesson(id: string, lesson: string): Promise<void> {
  await requirePermission('review_ai');
  const text = lesson.trim();

  await db.whatsAppReview.update({
    where: { id },
    data: {
      lesson: text || null,
      lessonEdited: true,
      // Editar depois de destilada obriga a refazer a consolidação, senão o
      // playbook segue com a versão antiga da lição.
      distilledAt: null,
    },
  });
}

// ---------------------------------------------------------------------------
// PLAYBOOK — as regras destiladas que entram no prompt do bot.
// ---------------------------------------------------------------------------

export interface PlaybookVersion {
  id: string;
  version: number;
  sections: { name: string; rules: { text: string; weight: number; states: string[] }[] }[];
  rulesCount: number;
  changeNote: string | null;
  status: string;
  reviewCount: number;
  publishedAt: string | null;
  createdAt: string;
}

/** Playbook publicado (o que o bot usa hoje) + rascunho pendente, se houver. */
export async function getPlaybookState(): Promise<{
  published: PlaybookVersion | null;
  draft: PlaybookVersion | null;
  /** Lições prontas esperando consolidação — quando > 0, dá para gerar versão. */
  pendingLessons: number;
}> {
  await requirePermission('review_ai');

  const map = (p: {
    id: string; version: number; sections: unknown; rulesCount: number;
    changeNote: string | null; status: string; reviewCount: number;
    publishedAt: Date | null; createdAt: Date;
  }): PlaybookVersion => ({
    id: p.id,
    version: p.version,
    sections: (p.sections as PlaybookVersion['sections']) ?? [],
    rulesCount: p.rulesCount,
    changeNote: p.changeNote,
    status: p.status,
    reviewCount: p.reviewCount,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  });

  const [published, draft, pendingLessons] = await Promise.all([
    db.whatsAppPlaybook.findFirst({ where: { status: 'publicado' }, orderBy: { version: 'desc' } }),
    db.whatsAppPlaybook.findFirst({ where: { status: 'rascunho' }, orderBy: { version: 'desc' } }),
    db.whatsAppReview.count({
      where: { distilledAt: null, lesson: { not: null }, status: 'revisado' },
    }),
  ]);

  return {
    published: published ? map(published) : null,
    draft: draft ? map(draft) : null,
    pendingLessons,
  };
}

/** Gera uma versão nova em RASCUNHO a partir das lições pendentes. Não publica. */
export async function generatePlaybookDraft(): Promise<{ version: number; rulesCount: number; changeNote: string; lessonCount: number }> {
  await requirePermission('review_ai');
  const out = await buildPlaybookDraft();
  return {
    version: out.version,
    rulesCount: out.rulesCount,
    changeNote: out.changeNote,
    lessonCount: out.lessonCount,
  };
}

/** Publica o rascunho: vira o playbook ativo e o bot passa a usá-lo. */
export async function approvePlaybook(playbookId: string): Promise<void> {
  const me = await requirePermission('review_ai');
  await publishPlaybook(playbookId, me.name ?? me.email);
}

/** Descarta um rascunho sem publicar. */
export async function discardPlaybookDraft(playbookId: string): Promise<void> {
  await requirePermission('review_ai');
  await db.whatsAppPlaybook.update({
    where: { id: playbookId },
    data: { status: 'descartado' },
  });
}

/**
 * Edita o texto de UMA regra aprendida.
 *
 * Editar a versão PUBLICADA republica na hora (o bot passa a usar já): é o
 * caminho para corrigir depressa uma regra que está atrapalhando o
 * atendimento, sem esperar a próxima consolidação.
 */
export async function editPlaybookRule(
  playbookId: string,
  sectionName: string,
  ruleIndex: number,
  text: string,
): Promise<void> {
  const me = await requirePermission('review_ai');
  const clean = text.trim();
  if (!clean) throw new Error('A regra não pode ficar vazia — para removê-la, use excluir.');

  const pb = await db.whatsAppPlaybook.findUnique({ where: { id: playbookId } });
  if (!pb) throw new Error('Versão não encontrada.');

  const sections = pb.sections as unknown as { name: string; rules: { text: string; weight: number; states: string[] }[] }[];
  const sec = sections.find((s) => s.name === sectionName);
  if (!sec?.rules[ruleIndex]) throw new Error('Regra não encontrada.');
  sec.rules[ruleIndex] = { ...sec.rules[ruleIndex], text: clean };

  await db.whatsAppPlaybook.update({
    where: { id: playbookId },
    data: { sections: sections as unknown as object },
  });

  // Publicado → o S3 precisa refletir a edição, senão o bot segue com o texto
  // velho até a próxima publicação.
  if (pb.status === 'publicado') await publishPlaybook(playbookId, me.name ?? me.email, true);
}

/** Exclui uma regra aprendida. Mesma regra de republicação do editar. */
export async function deletePlaybookRule(
  playbookId: string,
  sectionName: string,
  ruleIndex: number,
): Promise<void> {
  const me = await requirePermission('review_ai');

  const pb = await db.whatsAppPlaybook.findUnique({ where: { id: playbookId } });
  if (!pb) throw new Error('Versão não encontrada.');

  const sections = pb.sections as unknown as { name: string; rules: { text: string; weight: number; states: string[] }[] }[];
  const sec = sections.find((s) => s.name === sectionName);
  if (!sec?.rules[ruleIndex]) throw new Error('Regra não encontrada.');
  sec.rules.splice(ruleIndex, 1);

  // Seção que ficou sem regra some da lista.
  const cleaned = sections.filter((s) => s.rules.length > 0);
  const rulesCount = cleaned.reduce((n, s) => n + s.rules.length, 0);

  await db.whatsAppPlaybook.update({
    where: { id: playbookId },
    data: { sections: cleaned as unknown as object, rulesCount },
  });

  if (pb.status === 'publicado') await publishPlaybook(playbookId, me.name ?? me.email, true);
}

/** Contador leve para o badge da sidebar. */
export async function countPendingReviews(): Promise<number> {
  const ctx = await requirePermission('review_ai').catch(() => null);
  if (!ctx) return 0;
  return db.whatsAppReview.count({ where: { status: 'pendente' } });
}

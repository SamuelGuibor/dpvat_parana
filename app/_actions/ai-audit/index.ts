'use server';

// Server actions da auditoria de documentos por IA:
//  - runManualAiAudit: dispara a auditoria pelo card dialog (permissão run_ai_audit)
//  - submitAiAuditFeedback: registra a avaliação humana de uma auditoria
//    ("Não" / "Sim" / "Sim, além do esperado" + motivo opcional) como
//    comentário marcado — vira insumo de aprimoramento dos prompts.

import { db } from '@/app/_shared/lib/prisma';
import { requirePermission } from '@/app/_shared/lib/permissions-server';
import {
  runAiAudit,
  AiAuditType,
  AI_AUDIT_MARKER,
  AI_AUDIT_FEEDBACK_MARKER,
  AI_AUDIT_PENDING_MARKER,
} from '@/app/_shared/lib/ai-audit';
import { createLog } from '@/app/_shared/lib/log';

export async function runManualAiAudit({
  cardId,
  isProcess,
  auditType,
}: {
  cardId: string;
  isProcess: boolean;
  auditType: AiAuditType;
}) {
  const perms = await requirePermission('run_ai_audit');
  await runAiAudit({
    cardId,
    isProcess,
    auditType,
    authorId: perms.userId,
    authorName: perms.name ?? 'Equipe',
    trigger: 'manual',
  });
  return { ok: true };
}

/**
 * Cancela uma auditoria em andamento: apaga o comentário-placeholder — o
 * runAiAudit percebe o sumiço e descarta o resultado sem publicar.
 */
export async function cancelAiAudit({ pendingCommentId }: { pendingCommentId: string }) {
  await requirePermission('run_ai_audit');
  const pending = await db.comment.findUnique({
    where: { id: pendingCommentId },
    select: { id: true, text: true },
  });
  if (!pending) return { ok: true }; // já terminou ou já foi cancelada
  if (!pending.text.startsWith(AI_AUDIT_PENDING_MARKER)) {
    throw new Error('Este comentário não é uma auditoria em andamento.');
  }
  await db.comment.delete({ where: { id: pending.id } });
  return { ok: true };
}

/**
 * Exclui uma auditoria concluída (e os feedbacks ligados a ela).
 */
export async function deleteAiAuditComment({ commentId }: { commentId: string }) {
  await requirePermission('run_ai_audit');
  const comment = await db.comment.findUnique({
    where: { id: commentId },
    select: { id: true, text: true },
  });
  if (!comment) return { ok: true };
  if (!comment.text.startsWith(AI_AUDIT_MARKER) && !comment.text.startsWith(AI_AUDIT_PENDING_MARKER)) {
    throw new Error('Este comentário não é uma auditoria da IA.');
  }
  await db.comment.deleteMany({
    where: {
      OR: [
        { id: comment.id },
        // Feedbacks desta auditoria: "[[AI_AUDIT_FEEDBACK|<idDaAuditoria>|..."
        { text: { startsWith: `${AI_AUDIT_FEEDBACK_MARKER}${comment.id}|` } },
      ],
    },
  });
  return { ok: true };
}

export type AiAuditFeedbackRating = 'nao' | 'sim' | 'sim_alem';

const RATING_LABELS: Record<AiAuditFeedbackRating, string> = {
  nao: 'Não satisfatória',
  sim: 'Satisfatória',
  sim_alem: 'Satisfatória, além do esperado',
};

export async function submitAiAuditFeedback({
  commentId,
  rating,
  reason,
}: {
  commentId: string;
  rating: AiAuditFeedbackRating;
  reason?: string;
}) {
  const perms = await requirePermission('run_ai_audit');

  const audit = await db.comment.findUnique({
    where: { id: commentId },
    select: { id: true, userId: true, processId: true, targetName: true },
  });
  if (!audit) throw new Error('Comentário de auditoria não encontrado.');

  const label = RATING_LABELS[rating];
  const body = reason?.trim() ? `**${label}.** Motivo: ${reason.trim()}` : `**${label}.**`;

  await db.comment.create({
    data: {
      text: `${AI_AUDIT_FEEDBACK_MARKER}${audit.id}|${rating}]]\n${body}`,
      authorId: perms.userId,
      authorName: perms.name ?? 'Equipe',
      targetName: audit.targetName,
      userId: audit.userId,
      processId: audit.processId,
    },
  });

  await createLog({
    action: 'ai_audit_feedback',
    message: `avaliou uma auditoria da IA: ${label.toLowerCase()}`,
    authorId: perms.userId,
    authorName: perms.name ?? 'Equipe',
    userId: audit.userId,
    processId: audit.processId,
    metadata: { auditCommentId: audit.id, rating, reason: reason?.trim() || null },
  });

  return { ok: true };
}

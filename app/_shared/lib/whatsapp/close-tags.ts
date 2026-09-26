// Tag automática de desfecho: toda conversa encerrada leva uma tag com o
// rótulo do desfecho ("Transferidos ao atendente", "Sem resposta (não
// recuperado)", "Não qualificada — Acidente muito antigo"), para tag e
// desfecho andarem sempre juntos. Ao mudar o desfecho, a tag de desfecho
// anterior sai; tags manuais ficam. A decisão pura está em
// app/_shared/utils/close-tag-plan.ts.
//
// Módulo de lib (sem "use server"): antes a função morava no arquivo de
// actions do inbox e só o encerramento MANUAL aplicava a tag. Os encerramentos
// do bot (disqualify/resolve/opt-out), do cron (finalizeClose), do opt-out por
// regex e do bloqueio saíam sem tag, e filtrar por "Transferidos", "Perguntas"
// ou "Sem resposta" trazia 0 ou quase 0 deles (auditoria de 24/09/2026).
//
// Chame DEPOIS do update que encerra (o captureConversation vem antes dele).
// Best-effort: falha de tag nunca impede o encerramento; vira critical_error.

import { db } from '@/app/_shared/lib/prisma';
import { reportCriticalError } from '@/app/_shared/lib/report-error';
import { mergeCloseTag } from '@/app/_shared/utils/whatsapp-inbox';
import {
  closeTagProtectedNames, fallbackCloseLabel, planCloseTagSync,
} from '@/app/_shared/utils/close-tag-plan';
import { CLOSE_CATEGORY_LABELS, CLOSE_CATEGORY_OPTIONS } from './close-categories';

// Cor da tag automática de desfecho, por família de categoria.
export const CLOSE_TAG_COLORS: Record<string, string> = {
  qualificado: '#10b981',
  contratado_perdido: '#f43f5e',
  perguntas: '#3b82f6',
  novo_acidente: '#f59e0b',
  transferido: '#8b5cf6',
  sem_resposta: '#64748b',
  descartado: '#6b7280',
};

function closeTagColor(category: string): string {
  return CLOSE_TAG_COLORS[category]
    ?? (category.startsWith('nq_') || category === 'nao_qualificado' ? '#e05252' : '#6b7280');
}

export interface CloseTagDTO {
  id: string;
  name: string;
  color: string;
}

function labelFrom(category: string, reasons: { key: string; label: string }[]): string {
  return CLOSE_CATEGORY_LABELS[category]
    ?? reasons.find((r) => r.key === category)?.label
    ?? fallbackCloseLabel(category);
}

/**
 * Rótulo do desfecho: mapa estático → motivo da tabela whatsapp_close_reasons
 * (chaves `nq_*` da equipe e do cérebro) → rótulo legível (nunca a chave crua).
 * Lança se o banco falhar (o encerramento manual mostra erro próprio).
 */
export async function closeCategoryLabel(category: string): Promise<string> {
  const fixed = CLOSE_CATEGORY_LABELS[category];
  if (fixed) return fixed;
  const row = category.startsWith('nq_')
    ? await db.whatsAppCloseReason.findUnique({ where: { key: category }, select: { label: true } })
    : null;
  return row?.label ?? fallbackCloseLabel(category);
}

export interface PreparedCloseTag {
  /** Tags finais da conversa, na ordem de aplicação (a mesma da lista). */
  tags: CloseTagDTO[];
  /** Grava na conversa: tira as tags de desfecho anteriores e liga a atual. Nunca lança. */
  write: () => Promise<void>;
}

/**
 * Leituras + plano da tag de desfecho, sem mexer nas tags da conversa: o
 * `closeConversation` devolve as tags finais no patch da tela e grava depois
 * da resposta (`runAfterResponse`). Uma onda de leituras quando o rótulo já é
 * conhecido; a tag em si (`whatsapp_tags`) é criada aqui se ainda não existir,
 * porque o id dela entra no patch. null = falhou (o encerramento vale assim
 * mesmo e a tela corrige na próxima recarga pelo hash).
 */
export async function prepareCloseTag(
  conversationId: string,
  closeCategory: string,
  knownLabel?: string,
): Promise<PreparedCloseTag | null> {
  try {
    const upsertTag = (name: string) => db.whatsAppTag.upsert({
      where: { name },
      update: {},
      create: { name, color: closeTagColor(closeCategory) },
      select: { id: true, name: true, color: true },
    });
    const [reasons, current, presetTag] = await Promise.all([
      // Todos os rótulos que já foram (ou podem ter sido) tag de desfecho.
      db.whatsAppCloseReason.findMany({ select: { key: true, label: true } }),
      db.whatsAppConversationTag.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'asc' },
        select: { tag: { select: { id: true, name: true, color: true } } },
      }),
      knownLabel ? upsertTag(knownLabel) : Promise.resolve(null),
    ]);
    const label = knownLabel ?? labelFrom(closeCategory, reasons);
    const tag = presetTag ?? await upsertTag(label);

    const knownLabels = new Set<string>([
      ...Object.values(CLOSE_CATEGORY_LABELS),
      ...CLOSE_CATEGORY_OPTIONS.map((o) => o.label),
      ...reasons.map((r) => r.label),
    ]);
    const currentTags = current.map((ct) => ct.tag);
    const { removeTagIds } = planCloseTagSync(
      currentTags.map((t) => ({ tagId: t.id, name: t.name })),
      label,
      knownLabels,
      closeTagProtectedNames(closeCategory),
    );
    const alreadyOn = currentTags.some((t) => t.id === tag.id);

    return {
      tags: mergeCloseTag(currentTags, new Set(removeTagIds), tag),
      write: async () => {
        try {
          await Promise.all([
            removeTagIds.length
              ? db.whatsAppConversationTag.deleteMany({ where: { conversationId, tagId: { in: removeTagIds } } })
              : null,
            // skipDuplicates: religar uma tag que já está lá não recria a
            // linha nem muda o createdAt (a data de aplicação que os KPIs usam).
            alreadyOn
              ? null
              : db.whatsAppConversationTag.createMany({ data: [{ conversationId, tagId: tag.id }], skipDuplicates: true }),
          ]);
        } catch (err) {
          await reportCriticalError('tag de desfecho (gravação)', err, { metadata: { conversationId, closeCategory } });
        }
      },
    };
  } catch (err) {
    await reportCriticalError('tag de desfecho (leitura)', err, { metadata: { conversationId, closeCategory } });
    return null;
  }
}

/**
 * Aplica a tag do desfecho `closeCategory` na conversa (rótulo resolvido aqui)
 * e espera a gravação. Para bot, cron, opt-out e bloqueio, que não devolvem
 * patch para a tela. Nunca lança.
 */
export async function syncCloseTag(conversationId: string, closeCategory: string): Promise<void> {
  const prepared = await prepareCloseTag(conversationId, closeCategory);
  if (prepared) await prepared.write();
}

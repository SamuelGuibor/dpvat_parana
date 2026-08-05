import { db } from "@/app/_shared/lib/prisma";

/**
 * Aplica as tags configuradas num fluxo à conversa do contato (apply-only,
 * nunca remove tag existente). Usado tanto pelo disparo manual do atendente
 * quanto pelo bot. Nunca lança.
 */
export async function applyFlowTagsToContact(contactId: string, tagIds: unknown): Promise<string[]> {
  try {
    const ids = Array.isArray(tagIds) ? tagIds.filter((t): t is string => typeof t === "string") : [];
    if (!ids.length) return [];

    const conversation = await db.whatsAppConversation.findUnique({
      where: { contactId },
      select: { id: true },
    });
    if (!conversation) return [];

    // Só tags que ainda existem (podem ter sido excluídas depois de salvas no fluxo).
    const tags = await db.whatsAppTag.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    if (!tags.length) return [];

    await db.whatsAppConversationTag.createMany({
      data: tags.map((t) => ({ conversationId: conversation.id, tagId: t.id })),
      skipDuplicates: true,
    });
    return tags.map((t) => t.name);
  } catch (err) {
    console.error("[FLOW TAGS] Falha ao aplicar tags do fluxo:", err);
    return [];
  }
}

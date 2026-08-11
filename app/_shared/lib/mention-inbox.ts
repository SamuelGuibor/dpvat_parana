import { db } from "@/app/_shared/lib/prisma";

/**
 * Caixa de Menções e Tarefas.
 *
 * Toda @menção (comentário de card ou chat da equipe) além de gerar a
 * Notification do sino, grava um item aqui. O sino é volátil (o usuário limpa
 * e perde o rastro de "de onde era"); a caixa sobrevive até ser marcada como
 * ciente ou concluída.
 */

/** Trecho legível: sem markup de menção, negrito/itálico e marcadores da IA. */
export function cleanExcerpt(text: string, max = 500): string {
  const clean = (text ?? "")
    // @[Fulano](id) → @Fulano
    .replace(/@\[(.+?)\]\((.+?)\)/g, "@$1")
    // marcadores internos da auditoria por IA ([[AI_AUDIT|tipo|status]])
    .replace(/\[\[[A-Z_]+\|[^\]]*\]\]/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

interface RecordMentionsInput {
  /** Já expandido (setor/everyone) e sem o próprio autor. */
  recipientIds: string[];
  /** Null quando o autor é o bot (tarefas geradas pela IA). */
  authorId: string | null;
  authorName: string;
  // "whatsapp": tarefa do bot (lead qualificado precisa de card/contrato) —
  // o channelId carrega o contactId da conversa pra abrir direto no inbox.
  source: "comment" | "chat" | "whatsapp";
  /** Texto cru da mensagem/comentário — o trecho é limpo aqui. */
  text: string;
  /** Nome do card ou do canal. */
  targetName: string;
  commentId?: string | null;
  userId?: string | null;
  processId?: string | null;
  chatMessageId?: string | null;
  channelId?: string | null;
}

/**
 * Grava os itens da caixa. Nunca deve derrubar o fluxo principal (comentar /
 * enviar mensagem), então o erro é logado e engolido.
 */
export async function recordMentions({
  recipientIds,
  authorId,
  authorName,
  source,
  text,
  targetName,
  commentId = null,
  userId = null,
  processId = null,
  chatMessageId = null,
  channelId = null,
}: RecordMentionsInput): Promise<void> {
  const unique = [...new Set(recipientIds.filter(Boolean))];
  if (unique.length === 0) return;

  const excerpt = cleanExcerpt(text) || "(sem texto)";

  try {
    await db.mention.createMany({
      data: unique.map((recipientId) => ({
        recipientId,
        authorId,
        authorName,
        source,
        excerpt,
        targetName,
        commentId,
        userId,
        processId,
        chatMessageId,
        channelId,
      })),
    });
  } catch (err) {
    console.error("[MENTIONS] Falha ao gravar a caixa de menções:", err);
  }
}

// Comentar no card: Comment + log `comment_add` + sino + Caixa de Menções.
// Só membro da equipe pode ser mencionado — o card também é User, e um
// @[Cliente](id) mandaria Notification para o cliente.

import { db } from "../prisma";
import { createLog, isSystemAuthorId } from "../log";
import { recordMentions } from "../mention-inbox";
import { isTeamRole } from "../permissions";
import { extractMentions } from "@/app/_shared/utils/mentions";
import { CardWriteError, cardRef, sourceMeta, type WriteCommon } from "./types";

export interface AddCardCommentInput extends WriteCommon {
  text: string;
  /** Ids extras a mencionar (além dos @[Nome](id) do texto). */
  mentionIds?: string[];
  /** Nome exibido no comentário quando difere do autor do log (automação: "🤖 Bot (Automação)"). */
  displayName?: string;
  /** Automação: não gera sino/menção nem log próprio da menção (comportamento antigo). */
  notify?: boolean;
  automation?: { id: string; name: string } | null;
}

/**
 * Marcadores internos da UI ([[AI_AUDIT|…]]) mudam a renderização do
 * comentário; texto vindo da IA de operação não pode forjá-los.
 */
export function sanitizeOpCommentText(text: string): string {
  return (
    text
      .replace(/\[\[/g, "[ [")
      // @[Nome](id) embutido no texto (p.ex. copiado de um comentário) mencionaria
      // alguém que a prévia não mostrou: vira texto. Menção da IA só por `mentionIds`.
      .replace(/@\[(.+?)\]\((.+?)\)/g, "@$1")
      .trim()
  );
}

export async function addCardComment(input: AddCardCommentInput) {
  const { cardId, isProcess, author, source, op, notify = true, automation = null } = input;
  const text = source === "op" ? sanitizeOpCommentText(input.text) : input.text;
  if (!text.trim()) throw new CardWriteError("texto_vazio", "Comentário vazio.");

  const card = isProcess
    ? await db.process.findUnique({ where: { id: cardId }, select: { name: true } })
    : await db.user.findUnique({ where: { id: cardId }, select: { name: true } });
  if (!card) throw new CardWriteError("card_nao_encontrado", "Card não encontrado.");
  const targetName = card.name ?? "Usuário sem nome";
  const displayName = input.displayName ?? author.name;
  // Comment.authorId tem FK para User: autor de sistema ("system" do cron) vai nulo.
  const authorFk = isSystemAuthorId(author.id) ? null : author.id;

  const comment = await db.comment.create({
    data: { text, authorId: authorFk, authorName: displayName, ...cardRef(isProcess, cardId), targetName },
  });

  // Comentário de automação não gera comment_add: o autor do log seria quem
  // moveu o card, e a Visão do Gestor contaria como comentário dele.
  if (source !== "automation") await createLog({
    action: "comment_add",
    message: automation ? `adicionou um comentário (automação: ${automation.name})` : "adicionou um comentário",
    authorId: author.id,
    authorName: author.name,
    ...cardRef(isProcess, cardId),
    metadata: {
      preview: text.slice(0, 140),
      ...(automation ? { automationId: automation.id, automationName: automation.name } : {}),
      ...sourceMeta(source, op),
    },
  });

  if (!notify) return comment;

  const wanted = [...new Set([...extractMentions(text).map((m) => m.id), ...(input.mentionIds ?? [])])].filter(
    (id) => id !== author.id,
  );
  const team = wanted.length
    ? await db.user.findMany({ where: { id: { in: wanted } }, select: { id: true, role: true } })
    : [];
  const mentionedIds = team.filter((u) => isTeamRole(u.role)).map((u) => u.id);

  for (const recipientId of mentionedIds) {
    await db.notification.create({
      data: {
        recipientId,
        authorId: author.id,
        authorName: author.name,
        commentId: comment.id,
        ...cardRef(isProcess, cardId),
        targetName,
        message: `Você foi mencionado por ${author.name} em ${targetName}`,
      },
    });
  }

  // Caixa de Menções e Tarefas — o item fica lá até a pessoa marcar
  // ciente/concluído, mesmo que ela limpe o sino.
  await recordMentions({
    recipientIds: mentionedIds,
    authorId: authorFk,
    authorName: author.name,
    source: "comment",
    text,
    targetName,
    commentId: comment.id,
    ...cardRef(isProcess, cardId),
  });

  return comment;
}

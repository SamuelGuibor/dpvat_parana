// Marcar/desmarcar tag de card. Lê as tags atuais e só grava (e loga) se
// mudou: a tag é condição de automação, então o histórico precisa mostrar
// quem marcou/tirou — a rota antiga do site não deixava log nenhum.

import { db } from "../prisma";
import { createLog } from "../log";
import { CardWriteError, cardRef, sourceMeta, type WriteCommon } from "./types";

export interface SetCardTagInput extends WriteCommon {
  tagId: string;
  on: boolean;
  automation?: { id: string; name: string } | null;
}

export interface CardTagRow {
  id: string;
  name: string;
  color: string;
}

export async function setCardTag(input: SetCardTagInput): Promise<{ changed: boolean; tags: CardTagRow[] }> {
  const { cardId, isProcess, tagId, on, author, source, op, automation = null } = input;
  const tag = await db.cardTag.findUnique({ where: { id: tagId }, select: { id: true, name: true } });
  if (!tag) throw new CardWriteError("tag_nao_encontrada", "Tag não encontrada.");

  const tagSelect = { cardTags: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" as const } } };
  const current = isProcess
    ? await db.process.findUnique({ where: { id: cardId }, select: tagSelect })
    : await db.user.findUnique({ where: { id: cardId }, select: tagSelect });
  if (!current) throw new CardWriteError("card_nao_encontrado", "Card não encontrado.");

  const has = current.cardTags.some((t) => t.id === tag.id);
  if (has === on) return { changed: false, tags: current.cardTags };

  const data = { cardTags: { [on ? "connect" : "disconnect"]: { id: tag.id } } };
  const updated = isProcess
    ? await db.process.update({ where: { id: cardId }, data, select: tagSelect })
    : await db.user.update({ where: { id: cardId }, data, select: tagSelect });

  const suffix = automation ? ` (automação: ${automation.name})` : "";
  await createLog({
    action: on ? "tag_add" : "tag_remove",
    message: `${on ? "adicionou" : "removeu"} a tag "${tag.name}"${suffix}`,
    authorId: author.id,
    authorName: author.name,
    ...cardRef(isProcess, cardId),
    metadata: {
      tagId: tag.id,
      tagName: tag.name,
      ...(automation ? { automationId: automation.id, automationName: automation.name } : {}),
      ...sourceMeta(source, op),
    },
  });

  return { changed: true, tags: updated.cardTags };
}

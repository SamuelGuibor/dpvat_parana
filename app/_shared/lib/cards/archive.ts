// Arquivar (status) / desarquivar (null) um card. Mantém o labelId: ao
// desarquivar o card volta para a coluna em que estava. A data de
// arquivamento alimenta as planilhas Caique/UNI — mesmo destino = noop, para
// não trocar a data.

import { db } from "../prisma";
import { createLog } from "../log";
import { ARCHIVE_LABELS } from "../archive-catalog";
import type { ArchiveStatus } from "@/app/_actions/cards/archive-card";
import { CardWriteError, cardRef, sourceMeta, type WriteCommon } from "./types";

export interface SetCardArchiveInput extends WriteCommon {
  status: ArchiveStatus | null;
}

export async function setCardArchive(input: SetCardArchiveInput): Promise<{ noop: boolean; from: ArchiveStatus | null }> {
  const { cardId, isProcess, status, author, source, op } = input;
  const current = isProcess
    ? await db.process.findUnique({ where: { id: cardId }, select: { archiveStatus: true } })
    : await db.user.findUnique({ where: { id: cardId }, select: { archiveStatus: true } });
  if (!current) throw new CardWriteError("card_nao_encontrado", "Card não encontrado.");
  const from = (current.archiveStatus as ArchiveStatus | null) ?? null;
  if (from === status) return { noop: true, from };

  const data = { archiveStatus: status, archivedAt: status ? new Date() : null };
  if (isProcess) await db.process.update({ where: { id: cardId }, data });
  else await db.user.update({ where: { id: cardId }, data });

  await createLog({
    action: "archive",
    message: status ? `arquivou o card como "${ARCHIVE_LABELS[status]}"` : "desarquivou o card",
    authorId: author.id,
    authorName: author.name,
    ...cardRef(isProcess, cardId),
    metadata: {
      archiveStatus: status,
      archiveLabel: status ? ARCHIVE_LABELS[status] : null,
      archived: Boolean(status),
      ...sourceMeta(source, op),
    },
  });
  return { noop: false, from };
}

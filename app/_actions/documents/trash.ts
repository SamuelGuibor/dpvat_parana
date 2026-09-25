"use server";

import { db } from "../../_shared/lib/prisma";
import { createLog } from "../../_shared/lib/log";
import { requireTeam } from "../../_shared/lib/permissions-server";
import { TRASH_RETENTION_DAYS, hardDelete } from "../../_shared/lib/trash-purge";

/**
 * Lixeira da aba Arquivos (estilo galeria do celular): documento excluído fica
 * aqui por 30 dias podendo ser restaurado; depois disso o cron
 * /api/documents/trash/purge apaga de vez (`purgeExpiredTrash`, em
 * app/_shared/lib/trash-purge.ts — fora deste arquivo "use server" para não
 * virar action sem guard). Excluir de vez também pode ser manual, pelo botão
 * na própria lixeira. Nos dois casos o objeto do S3 só é apagado se nada mais
 * usa a key (mensagem do WhatsApp, fluxo, template ou outro Document).
 */

export interface TrashedDocDTO {
  id: string;
  key: string;
  name: string;
  deletedAt: string;
  deletedBy: string | null;
  /** Dias restantes até a purga automática (mínimo 0). */
  daysLeft: number;
}

function daysLeft(deletedAt: Date): number {
  const elapsed = (Date.now() - deletedAt.getTime()) / 86_400_000;
  return Math.max(0, Math.ceil(TRASH_RETENTION_DAYS - elapsed));
}

/** Lista a lixeira de um card (mais recentes primeiro). */
export async function listTrashedDocs(cardId: string, isProcess: boolean): Promise<TrashedDocDTO[]> {
  await requireTeam();
  const docs = await db.document.findMany({
    where: {
      deletedAt: { not: null },
      ...(isProcess ? { processId: cardId } : { userId: cardId, processId: null }),
    },
    select: { id: true, key: true, name: true, deletedAt: true, deletedBy: true },
    orderBy: { deletedAt: "desc" },
  });
  return docs.map((d) => ({
    id: d.id,
    key: d.key,
    name: d.name,
    deletedAt: d.deletedAt!.toISOString(),
    deletedBy: d.deletedBy,
    daysLeft: daysLeft(d.deletedAt!),
  }));
}

/** Tira o documento da lixeira — volta pra lista de arquivos do card. */
export async function restoreDoc(docId: string): Promise<void> {
  const ctx = await requireTeam();
  const doc = await db.document.findFirst({
    where: { id: docId, deletedAt: { not: null } },
    select: { name: true, userId: true, processId: true },
  });
  if (!doc) throw new Error("Documento não está na lixeira.");

  await db.document.update({
    where: { id: docId },
    data: { deletedAt: null, deletedBy: null },
  });

  await createLog({
    action: "document_restore",
    message: `restaurou o documento "${doc.name}" da lixeira`,
    authorId: ctx.userId,
    authorName: ctx.name ?? "Usuário",
    userId: doc.processId ? null : doc.userId,
    processId: doc.processId ?? null,
    metadata: { name: doc.name },
  });
}

/** Exclusão DEFINITIVA de um item da lixeira (S3 + banco). Irreversível. */
export async function purgeDoc(docId: string): Promise<void> {
  const ctx = await requireTeam();
  const doc = await db.document.findFirst({
    where: { id: docId, deletedAt: { not: null } },
    select: { key: true, name: true, userId: true, processId: true },
  });
  if (!doc) throw new Error("Documento não está na lixeira.");

  const { s3Kept } = await hardDelete(doc.key, docId);

  await createLog({
    action: "document_purge",
    message: `excluiu definitivamente o documento "${doc.name}"`,
    authorId: ctx.userId,
    authorName: ctx.name ?? "Usuário",
    userId: doc.processId ? null : doc.userId,
    processId: doc.processId ?? null,
    // s3Kept: a linha saiu, mas o arquivo continua no S3 porque a conversa do
    // WhatsApp (ou um fluxo/template) ainda usa o mesmo objeto.
    metadata: { name: doc.name, key: doc.key, s3Kept },
  });
}

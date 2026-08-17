"use server";

import { db } from "../../_shared/lib/prisma";
import { createLog } from "../../_shared/lib/log";
import { requireTeam } from "../../_shared/lib/permissions-server";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

/**
 * Lixeira da aba Arquivos (estilo galeria do celular): documento excluído fica
 * aqui por 30 dias podendo ser restaurado; depois disso o cron
 * /api/documents/trash/purge apaga de vez (S3 + banco). Excluir de vez também
 * pode ser manual, pelo botão na própria lixeira.
 *
 * (Não exportada: arquivo "use server" só pode exportar funções async.)
 */
const TRASH_RETENTION_DAYS = 30;

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

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

  await hardDelete(doc.key, docId);

  await createLog({
    action: "document_purge",
    message: `excluiu definitivamente o documento "${doc.name}"`,
    authorId: ctx.userId,
    authorName: ctx.name ?? "Usuário",
    userId: doc.processId ? null : doc.userId,
    processId: doc.processId ?? null,
    metadata: { name: doc.name, key: doc.key },
  });
}

/**
 * Purga tudo que passou dos 30 dias. Chamada pelo cron (a rota valida o
 * CRON_SECRET). Item a item de propósito: se um DeleteObject falhar no S3, o
 * registro fica pra próxima rodada em vez de virar órfão no bucket.
 */
export async function purgeExpiredTrash(): Promise<{ purged: number; failed: number }> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86_400_000);
  const expired = await db.document.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, key: true, name: true },
  });

  let purged = 0;
  let failed = 0;
  for (const doc of expired) {
    try {
      await hardDelete(doc.key, doc.id);
      purged += 1;
    } catch (err) {
      failed += 1;
      console.error(`[TRASH PURGE] Falha ao purgar "${doc.name}" (${doc.id}):`, err);
    }
  }
  return { purged, failed };
}

/**
 * Apaga do S3 e depois do banco. Se OUTRO registro ativo apontar pra mesma key
 * (re-upload do mesmo anexo pela ficha do WhatsApp, por exemplo), o objeto no
 * S3 é preservado e só a linha da lixeira some.
 */
async function hardDelete(key: string, docId: string): Promise<void> {
  const sharedKey = await db.document.findFirst({
    where: { key, id: { not: docId } },
    select: { id: true },
  });
  if (!sharedKey) {
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: key }),
    );
  }
  await db.document.delete({ where: { id: docId } });
}

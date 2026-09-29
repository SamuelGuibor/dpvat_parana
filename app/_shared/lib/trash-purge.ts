import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db } from "./prisma";
import { createLog } from "./log";
import { isSharedLibraryKey } from "../utils/s3-keys";

/**
 * Purga definitiva da lixeira de documentos (aba Arquivos do card e ficha do
 * WhatsApp). Fica fora de arquivo "use server" de propósito: exportada de lá,
 * `purgeExpiredTrash` virava server action sem guard, invocável por qualquer
 * sessão (inclusive cliente logado por CPF). Quem chama: o cron
 * /api/documents/trash/purge (valida o CRON_SECRET) e `purgeDoc` em
 * app/_actions/documents/trash.ts (valida a equipe).
 */
export const TRASH_RETENTION_DAYS = 30;

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

/**
 * O objeto do S3 ainda é usado por outro registro? Na dúvida, preserva: sobrar
 * objeto no bucket custa quase nada; apagar mídia em uso não tem volta.
 * - biblioteca compartilhada (fluxos e templates do WhatsApp);
 * - outro Document com a mesma key (ativo ou ainda na lixeira);
 * - alguma mensagem do WhatsApp com essa mediaKey (anexo que veio da conversa:
 *   a thread do inbox continua exibindo o mesmo objeto).
 *
 * A busca por mediaKey é SEM filtro de contactId de propósito: contato mesclado
 * ou movido por SQL avulso pode ter mensagem apontando para a key de outro
 * contato, e um falso negativo apaga a mídia da conversa. Sem índice custa um
 * seq scan (~30 ms), aceitável porque só roda na purga.
 */
async function isKeyStillReferenced(key: string, docId: string): Promise<boolean> {
  if (isSharedLibraryKey(key)) return true;
  const [otherDoc, message] = await Promise.all([
    db.document.findFirst({ where: { key, id: { not: docId } }, select: { id: true } }),
    db.whatsAppMessage.findFirst({ where: { mediaKey: key }, select: { id: true } }),
  ]);
  return Boolean(otherDoc || message);
}

/**
 * Apaga do S3 (se nada mais usa a key) e depois a linha do banco. Se o
 * DeleteObject falhar, lança antes de apagar a linha: o item fica para a
 * próxima rodada em vez de virar órfão no bucket.
 * `s3Kept` = a linha saiu, mas o objeto foi preservado.
 */
export async function hardDelete(key: string, docId: string): Promise<{ s3Kept: boolean }> {
  const s3Kept = await isKeyStillReferenced(key, docId);
  if (!s3Kept) {
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: key }),
    );
  }
  await db.document.delete({ where: { id: docId } });
  return { s3Kept };
}

/**
 * Purga tudo que passou dos 30 dias na lixeira. Item a item de propósito (ver
 * `hardDelete`). Cada item vira log `document_purge` no histórico do card, com
 * `s3Kept`: antes a purga automática não deixava rastro nenhum.
 */
export async function purgeExpiredTrash(): Promise<{ purged: number; failed: number; kept: number }> {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 86_400_000);
  const expired = await db.document.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, key: true, name: true, userId: true, processId: true },
  });

  let purged = 0;
  let failed = 0;
  let kept = 0;
  for (const doc of expired) {
    try {
      const { s3Kept } = await hardDelete(doc.key, doc.id);
      purged += 1;
      if (s3Kept) kept += 1;
      await createLog({
        action: "document_purge",
        message: `excluiu definitivamente o documento "${doc.name}" (${TRASH_RETENTION_DAYS} dias na lixeira)`,
        authorId: "system",
        authorName: "Sistema (lixeira)",
        userId: doc.processId ? null : doc.userId,
        processId: doc.processId ?? null,
        metadata: { name: doc.name, key: doc.key, s3Kept, auto: true },
      });
    } catch (err) {
      failed += 1;
      console.error(`[TRASH PURGE] Falha ao purgar "${doc.name}" (${doc.id}):`, err);
    }
  }
  console.info(`[TRASH PURGE] ${purged} purgado(s) (${kept} com objeto S3 preservado), ${failed} falha(s).`);
  return { purged, failed, kept };
}

"use server";

import { db } from "../../_shared/lib/prisma";
import { ensureDocExtension } from "../../_shared/utils/doc-name";

/**
 * Renomeia um documento trocando SÓ o nome de exibição. A key do S3 não muda:
 * ela pode ser a mesma de WhatsAppMessage.mediaKey (mídia anexada da conversa)
 * ou de um fluxo do bot, e copiar para uma key nova + apagar a antiga quebrava
 * a foto/PDF na thread do inbox. O download já usa `name` no
 * Content-Disposition, então o arquivo baixa com o nome novo.
 */
export async function updateDocumentName({
  id,
  newName,
}: {
  id: string;
  newName: string;
}) {
  if (!id || !newName.trim()) {
    throw new Error("ID ou nome inválido.");
  }

  const doc = await db.document.findUnique({ where: { id }, select: { key: true } });
  if (!doc) throw new Error("Documento não encontrado.");

  // Preserva a extensão da key (formato real do arquivo) e limpa o que
  // quebraria o header de download.
  const safeName = ensureDocExtension(newName, doc.key);
  if (!safeName) throw new Error("ID ou nome inválido.");

  return db.document.update({
    where: { id },
    data: { name: safeName },
    select: { id: true, name: true, key: true },
  });
}

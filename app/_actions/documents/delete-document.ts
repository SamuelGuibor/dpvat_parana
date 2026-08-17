"use server";

import { db } from "../../_shared/lib/prisma";
import { createLog } from "../../_shared/lib/log";
import { requireTeam } from "../../_shared/lib/permissions-server";

/**
 * "Excluir" um documento agora manda pra LIXEIRA (estilo galeria do celular):
 * marca deletedAt e o arquivo fica 30 dias restaurável na aba Arquivos. O
 * objeto no S3 NÃO é tocado aqui — quem apaga de verdade (S3 + banco) é a
 * purga em trash.ts (botão "excluir de vez" ou o cron dos 30 dias).
 */
export const deletDoc = async (docId: string) => {
  const ctx = await requireTeam();
  try {
    const document = await db.document.findFirst({
      where: { id: docId, deletedAt: null },
      select: { key: true, name: true, userId: true, processId: true },
    });

    if (!document) {
      throw new Error(`Documento com ID ${docId} não encontrado.`);
    }

    await db.document.update({
      where: { id: docId },
      data: { deletedAt: new Date(), deletedBy: ctx.name ?? null },
    });

    await createLog({
      action: "document_remove",
      message: `moveu o documento "${document.name}" para a lixeira`,
      authorId: ctx.userId,
      authorName: ctx.name ?? "Usuário",
      userId: document.processId ? null : document.userId,
      processId: document.processId ?? null,
      metadata: { name: document.name, key: document.key },
    });
  } catch (error) {
    console.error("Erro ao mover documento pra lixeira:", error);
    throw error; // Re-lançar o erro para ser capturado no client-side
  }
};

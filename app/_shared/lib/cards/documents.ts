// Mexer em documento do card (ajuste A, 26/10): renomear, trocar de pasta,
// mandar para a lixeira e restaurar. Mesmo efeito das telas da aba Arquivos
// (update-name-doc, /api/documents/category, delete-document, trash.ts) com
// autor explícito e log com a origem — tudo reversível: a lixeira guarda 30
// dias e a purga definitiva continua só no site/cron (nunca pela IA).

import { db } from "../prisma";
import { createLog } from "../log";
import { categoryLabel, type DocumentCategoryId } from "../document-categories";
import { ensureDocExtension } from "@/app/_shared/utils/doc-name";
import { CardWriteError, cardRef, sourceMeta, type WriteCommon } from "./types";

export type DocumentAction =
  | { tipo: "renomear"; nome: string }
  | { tipo: "mover_pasta"; pasta: DocumentCategoryId }
  | { tipo: "lixeira" }
  | { tipo: "restaurar" };

export interface DocumentWriteInput extends WriteCommon {
  documentId: string;
  acao: DocumentAction;
}

/** Nome final do renomear (a extensão vem da key, como no site); "" = inválido. */
export function finalDocName(nome: string, key: string): string {
  return ensureDocExtension(nome, key);
}

export async function writeDocument(input: DocumentWriteInput): Promise<{ noop: boolean }> {
  const { cardId, isProcess, documentId, acao, author, source, op } = input;
  const doc = await db.document.findFirst({
    where: { id: documentId, ...(isProcess ? { processId: cardId } : { userId: cardId }) },
    select: { id: true, key: true, name: true, category: true, deletedAt: true },
  });
  if (!doc) throw new CardWriteError("card_nao_encontrado", "Documento não encontrado neste card.");
  const base = { authorId: author.id, authorName: author.name, ...cardRef(isProcess, cardId) };
  const meta = sourceMeta(source, op);

  if (acao.tipo === "restaurar") {
    if (!doc.deletedAt) return { noop: true };
    await db.document.update({ where: { id: doc.id }, data: { deletedAt: null, deletedBy: null } });
    await createLog({ ...base, action: "document_restore", message: `restaurou o documento "${doc.name}" da lixeira`, metadata: { name: doc.name, ...meta } });
    return { noop: false };
  }
  // As outras ações valem só para documento fora da lixeira (Document filtra deletedAt: null).
  if (doc.deletedAt) throw new CardWriteError("card_nao_encontrado", "O documento está na lixeira: restaure antes.");

  if (acao.tipo === "lixeira") {
    await db.document.update({ where: { id: doc.id }, data: { deletedAt: new Date(), deletedBy: author.name } });
    await createLog({ ...base, action: "document_remove", message: `moveu o documento "${doc.name}" para a lixeira`, metadata: { name: doc.name, key: doc.key, ...meta } });
    return { noop: false };
  }
  if (acao.tipo === "mover_pasta") {
    if (doc.category === acao.pasta) return { noop: true };
    await db.document.update({ where: { id: doc.id }, data: { category: acao.pasta } });
    await createLog({
      ...base,
      action: "document_move",
      message: `moveu "${doc.name}" para a pasta ${categoryLabel(acao.pasta)}`,
      metadata: { document: doc.name, from: doc.category, to: acao.pasta, ...meta },
    });
    return { noop: false };
  }
  // A key do S3 nunca muda (pode ser a mesma da mídia do WhatsApp): só o nome de exibição.
  const nome = finalDocName(acao.nome, doc.key);
  if (!nome) throw new CardWriteError("texto_vazio", "Nome inválido.");
  if (nome === doc.name) return { noop: true };
  await db.document.update({ where: { id: doc.id }, data: { name: nome } });
  await createLog({
    ...base,
    action: "update",
    message: `renomeou o documento "${doc.name}" para "${nome}"`,
    metadata: { stage: "document_rename", from: doc.name, to: nome, ...meta },
  });
  return { noop: false };
}

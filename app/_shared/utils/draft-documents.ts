// Rascunho de documentos da ficha do WhatsApp (whatsapp_contacts.draftDocuments)
// → Document do card. Regras puras (sem banco) para o dedupe ser testável; a
// transação que reivindica o rascunho fica em migrateDraftDocuments
// (app/_shared/lib/whatsapp/copilot-data.ts).

import { fileNameFromKey } from "./s3-keys";

export interface DraftDocument {
  key: string;
  name: string;
  uploadedAt?: string;
}

/**
 * Lê o JSON do banco com tolerância. Item sem `key` é descartado (não há o que
 * migrar); sem `name` usa o nome do arquivo da key, para o documento não sumir
 * por causa de um JSON antigo ou editado à mão.
 */
export function parseDraftDocuments(raw: unknown): DraftDocument[] {
  if (!Array.isArray(raw)) return [];
  const out: DraftDocument[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const { key, name, uploadedAt } = item as Record<string, unknown>;
    if (typeof key !== "string" || !key.trim()) continue;
    out.push({
      key,
      name: typeof name === "string" && name.trim() ? name : fileNameFromKey(key),
      ...(typeof uploadedAt === "string" ? { uploadedAt } : {}),
    });
  }
  return out;
}

export interface ExistingDocumentRef {
  id: string;
  key: string;
  deletedAt: Date | null;
}

export interface DraftMigrationPlan {
  /** Keys que o card ainda não tem: viram Document novo. */
  create: DraftDocument[];
  /** Key que o card só tem na lixeira: restaura a linha em vez de duplicar. */
  restoreIds: string[];
  /** Keys que o card já tem ativas: só saem do rascunho. */
  alreadyInCard: number;
}

/**
 * Decide o que cada rascunho vira no card. Uma linha por key: criar uma 2ª
 * linha com a mesma key duplicaria o arquivo na aba Arquivos do card (o mesmo
 * anexo aparecia duas vezes). Key na lixeira é restaurada, como faz o "Anexar
 * no card" (attachConversationMediaToCard): o atendente anexou de novo, então
 * quer o arquivo no card.
 */
export function planDraftMigration(
  drafts: DraftDocument[],
  existing: ExistingDocumentRef[],
): DraftMigrationPlan {
  const byKey = new Map<string, ExistingDocumentRef[]>();
  for (const doc of existing) {
    const list = byKey.get(doc.key);
    if (list) list.push(doc);
    else byKey.set(doc.key, [doc]);
  }

  const seen = new Set<string>();
  const create: DraftDocument[] = [];
  const restoreIds: string[] = [];
  let alreadyInCard = 0;

  for (const draft of drafts) {
    // O mesmo arquivo anexado 2× no rascunho vira um documento só.
    if (seen.has(draft.key)) continue;
    seen.add(draft.key);

    const rows = byKey.get(draft.key);
    if (!rows?.length) {
      create.push(draft);
    } else if (rows.some((r) => r.deletedAt === null)) {
      alreadyInCard++;
    } else {
      // Só na lixeira: restaura uma linha (a mais recente) e deixa as outras
      // seguirem para a purga.
      const newest = rows.reduce((a, b) =>
        (b.deletedAt?.getTime() ?? 0) > (a.deletedAt?.getTime() ?? 0) ? b : a,
      );
      restoreIds.push(newest.id);
    }
  }

  return { create, restoreIds, alreadyInCard };
}

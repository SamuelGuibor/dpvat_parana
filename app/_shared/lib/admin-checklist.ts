// Checklist Previdenciário (aba Arquivos do card) — itens padrão e escrita
// compartilhados entre a rota /api/admin-checklist (seed lazy no primeiro GET)
// e a auditoria de documentos por IA (marcação automática).

import { db } from "./prisma";

// A ordem aqui define a ordem exibida; a seção agrupa visualmente no card.
export const DEFAULT_CHECKLIST_ITEMS: { text: string; section: string }[] = [
  { section: "COMERCIAL", text: "DOCUMENTO PESSOAL (ATUALIZADO)" },
  { section: "COMERCIAL", text: "COMPROVANTE DE ENDEREÇO" },
  { section: "COMERCIAL", text: "PROCURAÇÕES" },
  { section: "ADM", text: "SENHA/DOCS INSS" },
  { section: "ADM", text: "ROTEIRO" },
  { section: "MÉDICO", text: "PRONTUÁRIOS" },
  { section: "MÉDICO", text: "LAUDOS MÉDICOS" },
];

/**
 * Marca (ou desmarca) o item "DOCUMENTO PESSOAL (ATUALIZADO)" do checklist do
 * card. O seed normal é lazy (primeiro GET da aba Arquivos) — se o checklist
 * nunca foi aberto, semeia os itens padrão aqui antes de marcar; criar só o
 * item do documento impediria o seed dos demais (o GET só semeia com a lista
 * vazia). Retorna se algum item foi de fato marcado.
 */
export async function markPersonalDocChecklistItem(
  cardId: string,
  isProcess: boolean,
  checked: boolean,
): Promise<boolean> {
  const where = isProcess ? { processId: cardId } : { userId: cardId };
  return db.$transaction(async (tx) => {
    const count = await tx.adminChecklistItem.count({ where });
    if (count === 0) {
      await tx.adminChecklistItem.createMany({
        data: DEFAULT_CHECKLIST_ITEMS.map((item, i) => ({
          processId: isProcess ? cardId : null,
          userId: isProcess ? null : cardId,
          text: item.text,
          section: item.section,
          checked: false,
          order: i,
        })),
      });
    }
    // Por texto (não há slug): tolera renomeações leves tipo "DOCUMENTO
    // PESSOAL ATUALIZADO" sem parênteses, mas exige as DUAS partes pra não
    // marcar itens customizados da equipe que só citem "documento pessoal".
    const updated = await tx.adminChecklistItem.updateMany({
      where: {
        ...where,
        AND: [
          { text: { contains: "DOCUMENTO PESSOAL", mode: "insensitive" } },
          { text: { contains: "ATUALIZADO", mode: "insensitive" } },
        ],
      },
      data: { checked },
    });
    return updated.count > 0;
  });
}

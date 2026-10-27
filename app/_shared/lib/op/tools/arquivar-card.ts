import { z } from "zod/v4";
import { defineTool, OpToolError } from "../registry";
import { confirmSchema, previewOrExecute } from "../preview";
import { setCardArchive } from "../../cards/archive";
import { ARCHIVE_LABELS, DESTRUCTIVE_ARCHIVE } from "../../archive-catalog";
import type { ArchiveStatus } from "@/app/_actions/cards/archive-card";
import { normalizeColumnName } from "../resolve";
import { cardRefSchema } from "./obter-card";
import { cardSummary, loadCardState, writeCommon } from "./_escrita";

const schema = z
  .object({
    card: cardRefSchema,
    destino: z.string().min(1).max(80).optional().describe(`Rótulo do arquivamento: ${Object.values(ARCHIVE_LABELS).join(", ")}.`),
    desarquivar: z.boolean().optional().describe("true = volta o card para o board, na coluna em que estava."),
    ...confirmSchema,
  })
  .refine((a) => !!a.destino !== !!a.desarquivar, { message: "Informe destino OU desarquivar: true." });

export const arquivarCard = defineTool({
  name: "arquivar_card",
  description:
    "ESCRITA. Arquiva UM card num destino (APTOS CCS, ENVIADOS TAYNARA, VOLTAR UM DIA…) ou desarquiva. Chame com confirmar: true: executa na hora (ação direta, reversível). Destinos que encerram o cliente (perdeu contato definitivo, desistiu, descartado) são recusados aqui: vão por preparar_acao_irreversivel, com \"aprovo <código>\".",
  level: 3,
  permission: "archive_cards",
  schema,
  async run({ op, trace }, args) {
    const card = await loadCardState(args.card);
    let status: ArchiveStatus | null = null;
    if (args.destino) {
      const q = normalizeColumnName(args.destino);
      const hit = (Object.entries(ARCHIVE_LABELS) as [ArchiveStatus, string][]).find(
        ([k, label]) => normalizeColumnName(label) === q || normalizeColumnName(k) === q,
      );
      if (!hit) throw new OpToolError("nao_encontrado", `Destino "${args.destino}" não existe.`, 404, Object.values(ARCHIVE_LABELS));
      status = hit[0];
      if (DESTRUCTIVE_ARCHIVE.includes(status)) {
        throw new OpToolError("requer_aprovacao", `"${hit[1]}" encerra a relação com o cliente: use preparar_acao_irreversivel (acao arquivar_definitivo) — exige "aprovo <código>".`, 403);
      }
    }
    const atual = (card.archiveStatus as ArchiveStatus | null) ?? null;
    if (atual === status) {
      return {
        data: { noop: true, mensagem: status ? `O card já está arquivado em "${ARCHIVE_LABELS[status]}".` : "O card já está no board.", card: cardSummary(card) },
        summary: `noop arquivar ${card.cardNumber}`,
        cardIds: [card.id],
      };
    }
    const out = await previewOrExecute({
      tool: "arquivar_card",
      args,
      estado: { archiveStatus: atual },
      previa: {
        acao: status ? "arquivar" : "desarquivar",
        card: { cardNumber: card.cardNumber, nome: card.name },
        de: atual ? ARCHIVE_LABELS[atual] : "board (ativo)",
        para: status ? ARCHIVE_LABELS[status] : `board, coluna "${card.label?.name ?? card.role}"`,
        avisos: status ? ["o card sai do board; a data de arquivamento entra nas planilhas por destino"] : [],
      },
      execute: () => setCardArchive({ ...writeCommon(op, trace, card.id), status }),
    });
    if (!out.executed) {
      return { data: { previa: out.previa }, summary: `prévia arquivar ${card.cardNumber}`, cardIds: [card.id] };
    }
    const relido = await loadCardState(card.id);
    return { data: { feito: true, card: cardSummary(relido) }, summary: `${status ? `arquivou ${card.cardNumber} em ${ARCHIVE_LABELS[status]}` : `desarquivou ${card.cardNumber}`}`, cardIds: [card.id] };
  },
});

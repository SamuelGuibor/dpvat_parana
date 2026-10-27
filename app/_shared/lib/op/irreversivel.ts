// Ações irreversíveis no card pela IA (ajuste A, decisão 4 do dono, 26/10):
// excluir o card e arquivar em destino que encerra a relação com o cliente
// (DESTRUCTIVE_ARCHIVE). Nunca L3: seguem o contrato do L4 — preparar grava
// a aprovação (op_approvals, canal "card"), o operador digita "aprovo
// <código>" e só então executar_aprovado faz. O que se executa é o `args`
// do banco, conferido de novo (precheck) contra o card atual.

import { db } from "../prisma";
import { OpToolError } from "./registry";
import type { OperatorContext } from "./auth";
import type { OpTrace } from "../cards/types";
import { resolveOneCardId } from "./cards";
import { normalizeColumnName } from "./resolve";
import { ARCHIVE_LABELS, DESTRUCTIVE_ARCHIVE } from "../archive-catalog";
import type { ArchiveStatus } from "@/app/_actions/cards/archive-card";
import { setCardArchive } from "../cards/archive";
import { deleteCardById } from "../cards/delete";
import { operatorAuthor, writeCommon } from "./tools/_escrita";

export const ACOES_IRREVERSIVEIS = ["excluir_card", "arquivar_definitivo"] as const;
export type AcaoIrreversivel = (typeof ACOES_IRREVERSIVEIS)[number];

export interface CardApprovalArgs extends Record<string, unknown> {
  acao: AcaoIrreversivel;
  cardId: string;
  cardNumber: number | null;
  nome: string | null;
  /** Estado na preparação: mudou até a execução → hash_diferente. */
  labelId: string | null;
  archiveStatus: string | null;
  /** Só em arquivar_definitivo. */
  destino: ArchiveStatus | null;
}

async function loadCard(cardId: string) {
  return db.user.findUnique({
    where: { id: cardId },
    select: {
      id: true,
      cardNumber: true,
      name: true,
      role: true,
      labelId: true,
      archiveStatus: true,
      label: { select: { name: true } },
      _count: { select: { document: true, commentsOnCard: true } },
    },
  });
}

export async function prepareIrreversivel(input: {
  op: OperatorContext;
  card: string;
  acao: AcaoIrreversivel;
  destino?: string;
}): Promise<{ args: CardApprovalArgs; previa: Record<string, unknown>; cardId: string }> {
  if (input.acao === "excluir_card" && !input.op.permissions.delete_cards) {
    throw new OpToolError("sem_permissao", "Você não tem permissão para excluir cards.", 403);
  }
  if (input.acao === "arquivar_definitivo" && !input.op.permissions.archive_cards) {
    throw new OpToolError("sem_permissao", "Você não tem permissão para arquivar cards.", 403);
  }
  const cardId = await resolveOneCardId(input.card);
  const card = await loadCard(cardId);
  if (!card) throw new OpToolError("nao_encontrado", "Card não encontrado.", 404);

  let destino: ArchiveStatus | null = null;
  if (input.acao === "arquivar_definitivo") {
    const q = normalizeColumnName(input.destino ?? "");
    destino = DESTRUCTIVE_ARCHIVE.find((k) => normalizeColumnName(k) === q || normalizeColumnName(ARCHIVE_LABELS[k]) === q) ?? null;
    if (!destino) {
      throw new OpToolError(
        "nao_encontrado",
        `Destino "${input.destino ?? ""}" não é um arquivamento que encerra o cliente. Os outros destinos vão por arquivar_card.`,
        404,
        DESTRUCTIVE_ARCHIVE.map((k) => ARCHIVE_LABELS[k]),
      );
    }
    if (card.archiveStatus === destino) throw new OpToolError("noop", `O card já está arquivado em "${ARCHIVE_LABELS[destino]}".`, 409);
  }

  const args: CardApprovalArgs = {
    acao: input.acao,
    cardId: card.id,
    cardNumber: card.cardNumber,
    nome: card.name,
    labelId: card.labelId,
    archiveStatus: card.archiveStatus,
    destino,
  };
  const coluna = card.label?.name ?? card.role;
  const previa =
    input.acao === "excluir_card"
      ? {
          canal: "card",
          acao: "EXCLUIR O CARD",
          card: { cardNumber: card.cardNumber, nome: card.name },
          coluna,
          arquivado: card.archiveStatus ? ARCHIVE_LABELS[card.archiveStatus as ArchiveStatus] ?? card.archiveStatus : null,
          avisos: [
            "IRREVERSÍVEL: o card some do CRM junto com documentos, comentários e histórico dele (não há lixeira de card).",
            `vai junto: ${card._count.document} documento(s) e ${card._count.commentsOnCard} comentário(s)`,
            "se a ideia é só tirar do board, use arquivar_card",
          ],
        }
      : {
          canal: "card",
          acao: `ARQUIVAR EM "${ARCHIVE_LABELS[destino!]}"`,
          card: { cardNumber: card.cardNumber, nome: card.name },
          coluna,
          de: card.archiveStatus ? ARCHIVE_LABELS[card.archiveStatus as ArchiveStatus] ?? card.archiveStatus : "board (ativo)",
          avisos: ["encerra a relação com o cliente: o card sai do board e entra nas listas desse destino"],
        };
  return { args, previa, cardId: card.id };
}

/** Card sumiu ou mudou (coluna/arquivo) desde a preparação → prepare de novo. */
export async function precheckIrreversivel(args: CardApprovalArgs): Promise<void> {
  const card = await loadCard(args.cardId);
  if (!card) throw new OpToolError("hash_diferente", "O card não existe mais.", 409);
  if (card.labelId !== args.labelId || card.archiveStatus !== args.archiveStatus) {
    throw new OpToolError("hash_diferente", "O card mudou desde a preparação (coluna ou arquivamento). Prepare de novo.", 409);
  }
}

/** Executa o aprovado; nunca lança (executeApproval registra o resultado). */
export async function runApprovedIrreversivel(input: {
  args: CardApprovalArgs;
  op: OperatorContext;
  trace: OpTrace;
}): Promise<{ sent: boolean; [k: string]: unknown }> {
  const { args, op, trace } = input;
  try {
    if (args.acao === "excluir_card") {
      const out = await deleteCardById({ ...writeCommon(op, trace, args.cardId) });
      return { sent: true, acao: args.acao, cardNumber: out.cardNumber, autor: operatorAuthor(op).name };
    }
    await setCardArchive({ ...writeCommon(op, trace, args.cardId), status: args.destino });
    return { sent: true, acao: args.acao, destino: args.destino ? ARCHIVE_LABELS[args.destino] : null };
  } catch (err) {
    console.error("[op] ação irreversível falhou:", err);
    return { sent: false, error: err instanceof Error ? err.message.slice(0, 200) : "falha" };
  }
}

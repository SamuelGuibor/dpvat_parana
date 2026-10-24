import { z } from "zod/v4";
import { db } from "../../prisma";
import { fetchLabels } from "../../db/labels";
import { defineTool, OpToolError } from "../registry";
import { matchColumn } from "../resolve";
import { ACTIVE_CARD_WHERE } from "../cards";

/** Colunas na ordem do board + contagem de cards ativos (uma consulta agrupada). */
export async function loadColumns() {
  const [labels, counts] = await Promise.all([
    fetchLabels(),
    db.user.groupBy({ by: ["labelId"], where: ACTIVE_CARD_WHERE, _count: { _all: true } }),
  ]);
  const byLabel = new Map(counts.map((c) => [c.labelId, c._count._all]));
  return labels.map((l) => ({ id: l.id, nome: l.name, ordem: l.order, prazoDias: l.timeLimitDays, cardsAtivos: byLabel.get(l.id) ?? 0 }));
}

/**
 * Coluna pelo texto do operador. Ambígua → OpToolError "coluna_ambigua" com as
 * candidatas (a skill pergunta); nenhuma → "coluna_nao_encontrada" com a lista.
 */
export async function resolveColumn(query: string) {
  const cols = await loadColumns();
  const match = matchColumn(cols.map((c) => c.nome), query);
  if (match.exact !== null) return cols.find((c) => c.nome === match.exact)!;
  if (match.candidates.length === 1) return cols.find((c) => c.nome === match.candidates[0])!;
  if (match.candidates.length > 1) {
    throw new OpToolError("coluna_ambigua", `"${query}" casa com ${match.candidates.length} colunas. Qual delas?`, 409, match.candidates);
  }
  throw new OpToolError("coluna_nao_encontrada", `Nenhuma coluna parecida com "${query}".`, 404, cols.map((c) => c.nome));
}

export const listarColunas = defineTool({
  name: "listar_colunas",
  description:
    "Colunas do kanban na ordem do board, com prazo da coluna (dias) e quantos cards ativos há em cada. Use para mapear o nome que o operador falou para o nome real da coluna.",
  level: 1,
  permission: "op_use",
  schema: z.object({}),
  async run() {
    const cols = await loadColumns();
    return {
      data: {
        total: cols.length,
        colunas: cols.map((c) => ({ nome: c.nome, ordem: c.ordem, prazoDias: c.prazoDias, cardsAtivos: c.cardsAtivos })),
      },
      summary: `${cols.length} colunas`,
    };
  },
});

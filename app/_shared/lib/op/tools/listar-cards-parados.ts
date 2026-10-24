import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool } from "../registry";
import { brDate, brDaysBetween } from "../resolve";
import { ACTIVE_CARD_WHERE, cardListSelect, columnName, etapaLabel } from "../cards";
import { resolveColumn } from "./listar-colunas";

const DEFAULT_DIAS = 7;

const schema = z.object({
  coluna: z.string().optional().describe("Só uma coluna (nome aproximado serve; ambíguo devolve as opções)."),
  diasMin: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe(`Parado há pelo menos N dias na coluna. Sem isto: o prazo da coluna, ou ${DEFAULT_DIAS} se a coluna não tem prazo.`),
  limite: z.number().int().min(1).max(100).default(50),
});

export const listarCardsParados = defineTool({
  name: "listar_cards_parados",
  description:
    "Cards ativos parados na coluna atual há N dias ou mais (contados em dias de Brasília desde a entrada na coluna), agrupados por coluna, os mais antigos primeiro.",
  level: 1,
  permission: "op_use",
  schema,
  async run(_ctx, args) {
    const col = args.coluna ? await resolveColumn(args.coluna) : null;
    // ~300 cards ativos: carregar todos e filtrar aqui sai mais barato que N consultas por coluna.
    const rows = await db.user.findMany({
      where: { ...ACTIVE_CARD_WHERE, ...(col ? { labelId: col.id } : {}) },
      select: cardListSelect,
    });

    let semData = 0;
    const parados: { coluna: string; limiteDias: number; dias: number; row: (typeof rows)[number] }[] = [];
    for (const r of rows) {
      if (!r.statusStartedAt) {
        semData++;
        continue;
      }
      const limiteDias = args.diasMin ?? r.label?.timeLimitDays ?? DEFAULT_DIAS;
      const dias = brDaysBetween(r.statusStartedAt);
      if (dias >= limiteDias) parados.push({ coluna: columnName(r), limiteDias, dias, row: r });
    }
    parados.sort((a, b) => b.dias - a.dias);

    const shown = parados.slice(0, args.limite);
    const grupos = new Map<string, { coluna: string; limiteDias: number; total: number; cards: unknown[] }>();
    for (const p of parados) {
      const g = grupos.get(p.coluna) ?? { coluna: p.coluna, limiteDias: p.limiteDias, total: 0, cards: [] };
      g.total++;
      grupos.set(p.coluna, g);
    }
    for (const p of shown) {
      grupos.get(p.coluna)!.cards.push({
        cardNumber: p.row.cardNumber,
        nome: p.row.name,
        dias: p.dias,
        desde: brDate(p.row.statusStartedAt),
        etapa: etapaLabel(p.row.service, p.row.status),
        tags: p.row.cardTags.map((t) => t.name),
      });
    }

    return {
      data: {
        criterio: args.diasMin !== undefined ? `≥ ${args.diasMin} dias` : `≥ prazo da coluna (ou ${DEFAULT_DIAS} dias)`,
        total: parados.length,
        mostrados: shown.length,
        cardsSemDataDeEntrada: semData,
        grupos: [...grupos.values()].sort((a, b) => b.total - a.total),
      },
      summary: `${parados.length} card(s) parado(s)${col ? ` em ${col.nome}` : ""}`,
      cardIds: shown.map((p) => p.row.id),
    };
  },
});

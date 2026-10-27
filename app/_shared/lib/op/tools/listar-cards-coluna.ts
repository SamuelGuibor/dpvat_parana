import { z } from "zod/v4";
import { Prisma } from "@prisma/client";
import { db } from "../../prisma";
import { defineTool } from "../registry";
import { brDate, brDaysBetween } from "../resolve";
import { ACTIVE_CARD_WHERE, cardListSelect, etapaLabel } from "../cards";
import { resolveColumn } from "./listar-colunas";

const schema = z.object({
  coluna: z.string().min(2).describe("Nome da coluna (aproximado serve; ambíguo devolve as opções)."),
  tag: z.string().optional().describe("Só cards com esta tag (nome exato, sem diferenciar maiúsculas)."),
  hospital: z.string().optional().describe("Parte do nome do hospital."),
  servico: z.string().optional().describe("INSS, ou outro serviço cadastrado."),
  limite: z.number().int().min(1).max(100).default(50),
});

export const listarCardsColuna = defineTool({
  name: "listar_cards_coluna",
  description:
    "Cards ativos de UMA coluna, os há mais tempo na coluna primeiro, com filtros opcionais de tag, hospital e serviço. Devolve o total real e até `limite` cards, cada um com CPF, telefone, dias na coluna e prazoEstourado.",
  level: 1,
  permission: "op_use",
  schema,
  async run(_ctx, args) {
    const col = await resolveColumn(args.coluna);
    const where: Prisma.UserWhereInput = {
      ...ACTIVE_CARD_WHERE,
      labelId: col.id,
      ...(args.tag ? { cardTags: { some: { name: { equals: args.tag, mode: "insensitive" } } } } : {}),
      ...(args.hospital ? { hospital: { contains: args.hospital, mode: "insensitive" } } : {}),
      ...(args.servico ? { service: { equals: args.servico, mode: "insensitive" } } : {}),
    };
    const [total, rows] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({
        where,
        select: cardListSelect,
        orderBy: [{ statusStartedAt: { sort: "asc", nulls: "last" } }],
        take: args.limite,
      }),
    ]);
    // Item E (27/10): CPF/telefone e prazo estourado por card — a skill de
    // lote (WhatsApp, pendências) não precisa abrir card por card.
    const cards = rows.map((r) => {
      const dias = r.statusStartedAt ? brDaysBetween(r.statusStartedAt) : null;
      return {
      cardNumber: r.cardNumber,
      nome: r.name,
      cpf: r.cpf,
      telefone: r.telefone,
      diasNaColuna: dias,
      prazoEstourado: dias !== null && col.prazoDias !== null ? dias > col.prazoDias : null,
      desde: brDate(r.statusStartedAt),
      etapa: etapaLabel(r.service, r.status),
      servico: r.service,
      hospital: r.hospital,
      tags: r.cardTags.map((t) => t.name),
      };
    });
    return {
      data: { coluna: col.nome, prazoDias: col.prazoDias, total, mostrados: cards.length, estourados: cards.filter((c) => c.prazoEstourado).length, cards },
      summary: `${total} card(s) em ${col.nome}`,
      cardIds: rows.map((r) => r.id),
    };
  },
});

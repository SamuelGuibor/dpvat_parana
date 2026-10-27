// Etapa 7: varrer_inconsistencias — base da skill /varredura. L1 (op_use),
// só leitura: checagens fixas e baratas sobre os cards ATIVOS (uma leitura,
// ~300 linhas, como listar_cards_parados) e os fluxos bloqueados da IA. Cada
// item cita card, regra (com a fonte) e evidência; nenhuma regra oficial é
// mudada por aqui e nada é corrigido — a skill oferece UMA ação L3 por vez,
// com prévia. Checagens: app/_shared/utils/op-varredura.ts.

import { z } from "zod/v4";
import { db } from "../../prisma";
import { defineTool } from "../registry";
import { ACTIVE_CARD_WHERE, columnName } from "../cards";
import { resolveColumn } from "./listar-colunas";
import { HOSPITAL_COLUMNS_RE, VARREDURA_CHECAGENS, VARREDURA_REGRAS, findInconsistencies, type VarreduraItem } from "@/app/_shared/utils/op-varredura";

/** Fluxo com origem mais antiga que isso não entra (cobre 14 dias de parado com folga). */
const FLOW_LOOKBACK_DAYS = 90;

const schema = z.object({
  coluna: z.string().optional().describe("Só uma coluna (nome aproximado serve; ambíguo devolve as opções)."),
  checagens: z
    .array(z.enum(VARREDURA_CHECAGENS))
    .max(VARREDURA_CHECAGENS.length)
    .optional()
    .describe("Quais checagens: cpf_repetido, telefone_repetido, cpf_invalido, sem_hospital, fluxo_bloqueado. Sem isto: todas."),
  limite: z.number().int().min(1).max(50).default(30).describe("Máximo de itens (padrão 30)."),
});

export const varrerInconsistencias = defineTool({
  name: "varrer_inconsistencias",
  description:
    "Varredura de cards ativos com problema: CPF repetido entre cards, telefone repetido com CPF diferente, CPF inválido, card sem hospital nas colunas de pedido de prontuário, fluxo da IA bloqueado há mais de 3 dias. Cada item traz card, regra, fonte e evidência. Só leitura — não corrige nada.",
  level: 1,
  permission: "op_use",
  schema,
  async run(_ctx, args) {
    const col = args.coluna ? await resolveColumn(args.coluna) : null;
    const wantFlows = !args.checagens?.length || args.checagens.includes("fluxo_bloqueado");
    const [rows, flows] = await Promise.all([
      db.user.findMany({
        where: { ...ACTIVE_CARD_WHERE, ...(col ? { labelId: col.id } : {}) },
        // Nunca senha: só o que as checagens usam.
        select: { id: true, cardNumber: true, name: true, cpf: true, telefone: true, hospital: true, outro_hospital: true, role: true, label: { select: { name: true } } },
      }),
      wantFlows
        ? db.opWorkflow
            .findMany({
              where: { createdAt: { gte: new Date(Date.now() - FLOW_LOOKBACK_DAYS * 86_400_000) }, status: "bloqueado" },
              orderBy: { createdAt: "desc" },
              take: 200,
              select: { id: true, lastOperatorId: true, state: true },
            })
            .then((rows) => rows.map((r) => ({ id: r.id, operatorId: r.lastOperatorId, state: r.state })))
        : Promise.resolve([]),
    ]);
    const res = findInconsistencies({
      cards: rows.map((r) => ({
        id: r.id,
        cardNumber: r.cardNumber,
        nome: r.name,
        coluna: columnName(r),
        cpf: r.cpf,
        telefone: r.telefone,
        hospital: r.hospital,
        outroHospital: r.outro_hospital,
      })),
      flows,
      checagens: args.checagens,
      limite: args.limite,
    });

    const opIds = [...new Set(res.itens.map((i) => i.evidencia.operadorId).filter((x): x is string => typeof x === "string"))];
    const ops = opIds.length ? await db.user.findMany({ where: { id: { in: opIds } }, select: { id: true, name: true } }) : [];
    const opName = new Map(ops.map((o) => [o.id, o.name]));

    const grupos = new Map<string, { coluna: string; itens: unknown[] }>();
    for (const i of res.itens) {
      const g = grupos.get(i.card.coluna) ?? { coluna: i.card.coluna, itens: [] };
      const { operadorId, ...ev } = i.evidencia as VarreduraItem["evidencia"] & { operadorId?: string };
      g.itens.push({
        checagem: i.checagem,
        card: { cardNumber: i.card.cardNumber, nome: i.card.nome },
        regra: i.regra,
        evidencia: operadorId ? { ...ev, operador: opName.get(operadorId) ?? operadorId } : ev,
      });
      grupos.set(i.card.coluna, g);
    }
    const ativas = args.checagens?.length ? args.checagens : VARREDURA_CHECAGENS;
    return {
      data: {
        escopo: col ? `coluna ${col.nome}` : "todos os cards ativos",
        cardsVerificados: rows.length,
        checagens: ativas.map((k) => ({ checagem: k, ...VARREDURA_REGRAS[k], encontrados: res.totais[k] })),
        colunasDeProntuario: String(HOSPITAL_COLUMNS_RE),
        total: res.total,
        mostrados: res.mostrados,
        grupos: [...grupos.values()],
        aviso: "Checagens da IA, não regras oficiais. Nada foi alterado; qualquer correção é uma ação por vez, com prévia.",
      },
      summary: `varredura: ${res.total} item(ns) em ${rows.length} card(s)${col ? ` (${col.nome})` : ""}`,
      cardIds: [...new Set(res.itens.map((i) => i.card.id))],
    };
  },
});

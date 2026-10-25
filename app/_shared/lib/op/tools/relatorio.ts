// Etapa 7: gerar_relatorio — as métricas da Operação por IA para a skill
// /auditoria-operacao. L1, permissão manager_dashboard (canRun exige op_use +
// a chave). Mesma lib da tela (app/_shared/lib/op/metrics.ts).
//
// NUNCA devolve texto de prompt nem `args` de ferramenta/aprovação (têm dado
// pessoal; o texto fica só na tela do gestor — decisão 7). Sai só contagem,
// id (op_tool_calls / op_requests / op_approvals), nº do card, código, skill
// e nome de quem opera (equipe).

import { z } from "zod/v4";
import { db } from "../../prisma";
import { TEAM_ROLES } from "../../permissions";
import { defineTool, OpToolError } from "../registry";
import { brDateTime } from "../resolve";
import { getOpMetrics, type OpMetricsView } from "../metrics";
import { OP_METRIC_DEFINITIONS, OP_PERIOD_MAX_DAYS, OpPeriodError, resolveOpPeriod } from "@/app/_shared/utils/op-metrics";

export const RELATORIO_TIPOS = ["operacao", "falhas", "fluxos", "aprovacoes"] as const;

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data no formato AAAA-MM-DD (dia de Brasília)");

const schema = z.object({
  tipo: z.enum(RELATORIO_TIPOS).describe("operacao (rendimento por pessoa, consultas, ferramentas, cards) | falhas | fluxos | aprovacoes"),
  dias: z.number().int().min(1).max(OP_PERIOD_MAX_DAYS).optional().describe("Últimos N dias de Brasília, hoje incluso. Padrão 7."),
  de: dayKey.optional().describe("Início (AAAA-MM-DD, Brasília). Use com `ate` em vez de `dias`."),
  ate: dayKey.optional().describe("Fim inclusivo (AAAA-MM-DD, Brasília)."),
  operador: z.string().min(2).max(80).optional().describe("Só um membro da equipe (nome ou parte do nome)."),
});

async function resolveOperador(ref: string): Promise<{ id: string; nome: string }> {
  const rows = await db.user.findMany({
    where: { role: { in: [...TEAM_ROLES] }, OR: [{ id: ref }, { name: { contains: ref, mode: "insensitive" } }] },
    select: { id: true, name: true },
    take: 10,
  });
  if (rows.length === 1) return { id: rows[0].id, nome: rows[0].name ?? rows[0].id };
  if (!rows.length) throw new OpToolError("nao_encontrado", `Ninguém da equipe com o nome "${ref}".`, 404);
  throw new OpToolError("ambiguo", `${rows.length} pessoas da equipe casam com "${ref}". Qual?`, 409, rows.map((r) => r.name));
}

/** Monta a saída por tipo — exportado para o teste (sem banco). */
export function shapeRelatorio(tipo: (typeof RELATORIO_TIPOS)[number], m: OpMetricsView) {
  const nome = (id: string) => m.nomes[id] ?? id;
  const card = (id: string | null) => (id ? (m.cardsInfo[id]?.cardNumber ?? null) : null);
  const periodo = m.periodo;
  if (tipo === "operacao") {
    return {
      periodo,
      definicoes: OP_METRIC_DEFINITIONS,
      // Dias zerados ficam fora (90 dias de zeros só gastam contexto do modelo).
      totais: { ...m.totais, porDia: m.totais.porDia.filter((d) => d.pedidos || d.falhas) },
      operadores: m.operadores.map((o) => ({
        operador: nome(o.operatorId),
        pedidos: o.pedidos,
        consultas: o.consultas,
        acoes: o.acoes,
        conversas: o.conversas,
        sessoes: o.sessoes,
        minutosAtivos: o.minutosAtivos,
        latenciaSeg: Math.round(o.latenciaMs / 100) / 10,
        chamadas: o.chamadas,
        falhas: o.falhas,
        cardsConduzidos: o.cardsConduzidos,
        cardsTocados: o.cardsTocados,
        aprovacoes: o.aprovacoes,
        fluxos: o.fluxos,
        porDia: o.porDia.filter((d) => d.pedidos || d.falhas),
      })),
      skills: m.skills,
      consultasFrequentes: m.consultasFrequentes,
      ferramentas: m.ferramentas,
      cardsConduzidos: m.cards.conduzidos.map((c) => ({
        card: card(c.cardId),
        operadores: c.operadores.map(nome),
        acoes: c.acoes,
        ferramentas: c.ferramentas,
        ultimo: brDateTime(c.ultimo),
      })),
      cardsTocadosSoLeitura: m.cards.tocadosSoLeitura,
      cortado: m.cortado,
    };
  }
  if (tipo === "falhas") {
    const total = m.totais.chamadas;
    return {
      periodo,
      definicao: OP_METRIC_DEFINITIONS.falhas,
      chamadas: total,
      falhas: m.totais.falhas,
      taxaFalhaPct: total ? Math.round((m.totais.falhas / total) * 1000) / 10 : 0,
      porCodigo: m.falhas.map((f) => ({
        ferramenta: f.tool,
        code: f.code,
        total: f.total,
        exemplos: f.exemplos,
        cards: f.cardIds.map(card).filter((n) => n !== null),
        operadores: f.operadores.map(nome),
      })),
      cortado: m.cortado,
    };
  }
  if (tipo === "fluxos") {
    return {
      periodo,
      definicao: OP_METRIC_DEFINITIONS.fluxos,
      porStatus: m.fluxos.porStatus,
      porWorkflow: m.fluxos.porWorkflow,
      bloqueios: m.fluxos.bloqueios,
      parados: m.fluxos.parados.map((f) => ({
        fluxo: f.requestId,
        workflow: f.workflow,
        card: f.cardNumber ?? card(f.cardId),
        status: f.status,
        passo: f.passo,
        bloqueio: f.bloqueio,
        diasParado: f.diasParado,
        operador: nome(f.operatorId),
      })),
      cortado: m.cortado,
    };
  }
  const porOperador = m.operadores
    .filter((o) => o.aprovacoes.preparadas > 0)
    .map((o) => ({ operador: nome(o.operatorId), ...o.aprovacoes }));
  return {
    periodo,
    definicao: OP_METRIC_DEFINITIONS.aprovacoes,
    porStatus: m.aprovacoes.porStatus,
    porCanal: m.aprovacoes.porCanal,
    porOperador,
    lista: m.aprovacoes.lista.map((a) => ({
      aprovacao: a.id,
      canal: a.canal,
      status: a.status,
      card: card(a.cardId),
      operador: nome(a.operatorId),
      criadaEm: brDateTime(a.criadaEm),
    })),
    cortado: m.cortado,
  };
}

export const gerarRelatorio = defineTool({
  name: "gerar_relatorio",
  description:
    "Relatório da Operação por IA (só gestor): rendimento por pessoa, consultas, ferramentas, cards conduzidos, falhas por código, fluxos parados e aprovações de envio, num período em dias de Brasília (até 90). Devolve só números, ids e nº de card — nunca o texto dos pedidos. Só leitura.",
  level: 1,
  permission: "manager_dashboard",
  schema,
  async run(_ctx, args) {
    let periodo;
    try {
      periodo = resolveOpPeriod({ dias: args.dias, de: args.de, ate: args.ate });
    } catch (err) {
      if (err instanceof OpPeriodError) throw new OpToolError("argumentos_invalidos", err.message, 400);
      throw err;
    }
    const op = args.operador ? await resolveOperador(args.operador) : null;
    const m = await getOpMetrics({ periodo, operatorId: op?.id ?? null });
    return {
      data: { tipo: args.tipo, ...(op ? { operador: op.nome } : {}), ...shapeRelatorio(args.tipo, m) },
      summary: `relatório ${args.tipo} ${periodo.de}–${periodo.ate}${op ? ` (${op.nome})` : ""}: ${m.totais.pedidos} pedido(s), ${m.totais.falhas} falha(s)`,
      // Relatório não "toca" card: não polui o /meu-dia nem o próprio dashboard.
      cardIds: [],
    };
  },
});

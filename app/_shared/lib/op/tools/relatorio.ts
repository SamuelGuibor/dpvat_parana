// Etapa 7: gerar_relatorio — as métricas da Operação por IA para a skill
// /auditoria-operacao e /meu-rendimento. L1, op_use: quem tem
// manager_dashboard vê a equipe toda; os outros, SÓ o próprio rendimento
// (decisão 5 do dono, 26/10). Mesma lib da tela (app/_shared/lib/op/metrics.ts).
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
import { OP_METRIC_DEFINITIONS, OP_PERIOD_MAX_DAYS, OpPeriodError, resolveOpPeriod, type IgnoradoItem } from "@/app/_shared/utils/op-metrics";

export const RELATORIO_TIPOS = ["operacao", "falhas", "fluxos", "aprovacoes", "ignorados"] as const;

const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data no formato AAAA-MM-DD (dia de Brasília)");

const schema = z.object({
  tipo: z.enum(RELATORIO_TIPOS).describe("operacao (rendimento por pessoa, consultas, ferramentas, cards) | falhas | fluxos | aprovacoes | ignorados (prévias sem OK, envios apesar do aviso, cards pulados — item G)"),
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
        sessoes: o.sessoes,
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
  if (tipo === "ignorados") {
    const ig = m.ignorados;
    const linha = (i: IgnoradoItem) => ({ id: i.id, operador: nome(i.operatorId), ferramenta: i.tool, card: card(i.cardId), avisos: i.avisos, quando: brDateTime(new Date(i.quando)) });
    return {
      periodo,
      definicao: OP_METRIC_DEFINITIONS.ignorados,
      totais: { previasNaoConfirmadas: ig.previasNaoConfirmadas.length, enviosComAviso: ig.enviosComAviso.length, cardsPulados: ig.cardsPulados, naoEnviados: ig.naoEnviados },
      porOperador: Object.entries(ig.porOperador).map(([id, v]) => ({ operador: nome(id), ...v })),
      previasNaoConfirmadas: ig.previasNaoConfirmadas.map(linha),
      enviosComAviso: ig.enviosComAviso.map(linha),
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
    "Relatório da Operação por IA: rendimento, consultas, ferramentas, cards conduzidos, falhas por código, fluxos parados e aprovações de envio, num período em dias de Brasília (até 90). Gestor (Visão do Gestor) vê a equipe toda ou um operador; os demais veem SÓ o próprio rendimento (escopo: \"proprio\"). Devolve só números, ids e nº de card — nunca o texto dos pedidos. Só leitura.",
  level: 1,
  permission: "op_use",
  schema,
  async run({ op: ctx }, args) {
    let periodo;
    try {
      periodo = resolveOpPeriod({ dias: args.dias, de: args.de, ate: args.ate });
    } catch (err) {
      if (err instanceof OpPeriodError) throw new OpToolError("argumentos_invalidos", err.message, 400);
      throw err;
    }
    const gestor = ctx.permissions.manager_dashboard === true;
    let op: { id: string; nome: string } | null;
    if (gestor) {
      op = args.operador ? await resolveOperador(args.operador) : null;
    } else {
      // Sem Visão do Gestor: sempre o próprio. Pedir outra pessoa é recusado
      // (não cai calado no próprio, para o operador não achar que viu o colega).
      op = { id: ctx.userId, nome: ctx.name ?? ctx.email };
      if (args.operador) {
        const alvo = await resolveOperador(args.operador);
        if (alvo.id !== ctx.userId) throw new OpToolError("sem_permissao", "Você só pode ver o seu próprio rendimento (a equipe toda é da Visão do Gestor).", 403);
      }
    }
    const m = await getOpMetrics({ periodo, operatorId: op?.id ?? null });
    return {
      data: { tipo: args.tipo, escopo: gestor ? (op ? "operador" : "equipe") : "proprio", ...(op ? { operador: op.nome } : {}), ...shapeRelatorio(args.tipo, m) },
      summary: `relatório ${args.tipo} ${periodo.de}–${periodo.ate}${op ? ` (${op.nome})` : ""}: ${m.totais.pedidos} pedido(s), ${m.totais.falhas} falha(s)`,
      // Relatório não "toca" card: não polui o /meu-dia nem o próprio dashboard.
      cardIds: [],
    };
  },
});

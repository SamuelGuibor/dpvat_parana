import { describe, it, expect } from "vitest";
import {
  OP_SKILLS,
  approvalStatus,
  buildOpMetrics,
  callKind,
  classifyPrompt,
  dayKeyDiff,
  dayKeysBetween,
  flowStatus,
  resolveOpPeriod,
  type MetricCall,
  type MetricPrompt,
} from "@/app/_shared/utils/op-metrics";
import { markDone, block, newState, finish } from "@/app/_shared/utils/workflows";

const CARD = "cmsp9hqlk0001l904y4fyvnku";
const CARD2 = "cmsp9hqlk0002l904y4fyvnku";
// 25/10/2026 10:00 em Brasília (UTC−3).
const agora = new Date("2026-10-25T13:00:00Z");

function call(over: Partial<MetricCall> & { id: string }): MetricCall {
  return {
    operatorId: "op1",
    requestId: null,
    sessionId: "s1",
    tool: "obter_card",
    level: 1,
    ok: true,
    code: null,
    confirmed: false,
    noop: false,
    cardIds: [],
    durationMs: 100,
    createdAt: new Date("2026-10-25T12:00:00Z"),
    ...over,
  };
}
function prompt(over: Partial<MetricPrompt> & { id: string }): MetricPrompt {
  return { operatorId: "op1", sessionId: "s1", skill: null, createdAt: new Date("2026-10-25T12:00:00Z"), ...over };
}

describe("período em dias de Brasília", () => {
  it("padrão 7 dias inclui hoje; 21h BRT ainda é o mesmo dia (servidor em UTC)", () => {
    const p = resolveOpPeriod({}, agora);
    expect(p).toMatchObject({ de: "2026-10-19", ate: "2026-10-25", dias: 7 });
    expect(p.gte.toISOString()).toBe("2026-10-19T03:00:00.000Z");
    expect(p.lt.toISOString()).toBe("2026-10-26T03:00:00.000Z");
    // 25/10 23:30 BRT = 26/10 02:30Z: o "hoje" continua 25/10.
    const tarde = resolveOpPeriod({ dias: 1 }, new Date("2026-10-26T02:30:00Z"));
    expect(tarde).toMatchObject({ de: "2026-10-25", ate: "2026-10-25" });
  });
  it("de/ate inclusivos, teto de 90 dias, formato e ordem", () => {
    expect(resolveOpPeriod({ de: "2026-10-01", ate: "2026-10-25" }, agora).dias).toBe(25);
    expect(resolveOpPeriod({ dias: 90 }, agora).dias).toBe(90);
    expect(() => resolveOpPeriod({ dias: 91 }, agora)).toThrow(/90 dias/);
    expect(() => resolveOpPeriod({ de: "2026-01-01", ate: "2026-10-25" }, agora)).toThrow(/90 dias/);
    expect(() => resolveOpPeriod({ de: "2026-10-25", ate: "2026-10-01" }, agora)).toThrow(/depois/);
    expect(() => resolveOpPeriod({ de: "25/10/2026" }, agora)).toThrow(/AAAA-MM-DD/);
  });
  it("chaves de calendário atravessam mês e horário sem fuso", () => {
    expect(dayKeysBetween("2026-09-29", "2026-10-02")).toEqual(["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
    expect(dayKeyDiff("2026-10-25", "2026-11-01")).toBe(7);
  });
});

describe("classificação sem ler o texto", () => {
  it("conversa × consulta × ação", () => {
    expect(classifyPrompt({ skill: null, levels: [] })).toBe("conversa");
    expect(classifyPrompt({ skill: "validar", levels: [] })).toBe("conversa"); // skill de desenvolvimento
    expect(classifyPrompt({ skill: "plano", levels: [] })).toBe("conversa");
    expect(classifyPrompt({ skill: "hospital", levels: [] })).toBe("consulta");
    expect(classifyPrompt({ skill: null, levels: [1, 1] })).toBe("consulta");
    expect(classifyPrompt({ skill: null, levels: [1, 2] })).toBe("acao");
    expect(classifyPrompt({ skill: null, levels: [3] })).toBe("acao");
    expect(classifyPrompt({ skill: null, levels: [4] })).toBe("acao");
    expect(OP_SKILLS).toContain("varredura");
    expect(OP_SKILLS).not.toContain("migration");
  });
  it("tipo da chamada: prévia, execução, noop, preparo, falha", () => {
    expect(callKind({ tool: "obter_card", level: 1, ok: true, confirmed: false, noop: false })).toBe("leitura");
    expect(callKind({ tool: "preparar_procuracao", level: 2, ok: true, confirmed: false, noop: false })).toBe("preparo");
    expect(callKind({ tool: "mover_card", level: 3, ok: true, confirmed: false, noop: false })).toBe("previa");
    expect(callKind({ tool: "mover_card", level: 3, ok: true, confirmed: true, noop: false })).toBe("execucao");
    expect(callKind({ tool: "mover_card", level: 3, ok: true, confirmed: true, noop: true })).toBe("noop");
    expect(callKind({ tool: "preparar_email", level: 4, ok: true, confirmed: false, noop: false })).toBe("preparo");
    expect(callKind({ tool: "executar_aprovado", level: 4, ok: true, confirmed: false, noop: false })).toBe("execucao");
    expect(callKind({ tool: "mover_card", level: 3, ok: false, confirmed: true, noop: false })).toBe("falha");
  });
  it("aprovação pendente vencida conta como expirada", () => {
    expect(approvalStatus({ status: "pendente", expiresAt: new Date("2026-10-25T12:00:00Z") }, agora)).toBe("expirada");
    expect(approvalStatus({ status: "pendente", expiresAt: new Date("2026-10-25T14:00:00Z") }, agora)).toBe("pendente");
    expect(approvalStatus({ status: "executada", expiresAt: new Date("2026-10-01T00:00:00Z") }, agora)).toBe("executada");
  });
});

describe("buildOpMetrics", () => {
  const periodo = { de: "2026-10-19", ate: "2026-10-25" };

  it("pedidos, consultas, ações (conversa fica fora de tudo); cards conduzidos só por execução", () => {
    const m = buildOpMetrics({
      periodo,
      agora,
      prompts: [
        prompt({ id: "r1", skill: "cliente" }),
        prompt({ id: "r2", createdAt: new Date("2026-10-25T12:05:00Z") }),
        prompt({ id: "r3", createdAt: new Date("2026-10-25T12:06:00Z") }),
        prompt({ id: "r4", skill: "validar" }),
        prompt({ id: "r5", operatorId: "op2", sessionId: "s2", skill: "parados" }),
      ],
      calls: [
        call({ id: "c1", requestId: "r1", cardIds: [CARD] }),
        call({ id: "c2", requestId: "r2", tool: "mover_card", level: 3, cardIds: [CARD], createdAt: new Date("2026-10-25T12:05:10Z") }),
        call({ id: "c3", requestId: "r3", tool: "mover_card", level: 3, confirmed: true, cardIds: [CARD], createdAt: new Date("2026-10-25T12:06:10Z") }),
        call({ id: "c4", operatorId: "op2", sessionId: "s2", requestId: "r5", tool: "listar_cards_parados", cardIds: [CARD2] }),
        call({ id: "c5", operatorId: "op2", sessionId: "s2", requestId: "r5", tool: "obter_card", ok: false, code: "sem_permissao", cardIds: [CARD2] }),
      ],
      approvals: [],
      flows: [],
    });
    const op1 = m.operadores.find((o) => o.operatorId === "op1")!;
    expect(op1).toMatchObject({ pedidos: 3, consultas: 1, acoes: 2, cardsConduzidos: 1, cardsTocados: 0, chamadas: 3, falhas: 0, sessoes: 1 });
    // Decisões 19 e 23 (26/10): conversa não aparece em número nenhum e não há tempo por intervalo.
    expect(op1).not.toHaveProperty("conversas");
    expect(op1).not.toHaveProperty("minutosAtivos");
    expect(m.totais).toMatchObject({ pedidos: 4, cardsConduzidos: 1, cardsTocados: 1, falhas: 1 });
    expect(m.cards.conduzidos).toEqual([expect.objectContaining({ cardId: CARD, acoes: 1, ferramentas: ["mover_card"], operadores: ["op1"] })]);
    expect(m.falhas).toEqual([{ tool: "obter_card", code: "sem_permissao", total: 1, exemplos: ["c5"], cardIds: [CARD2], operadores: ["op2"] }]);
    const mover = m.ferramentas.find((t) => t.tool === "mover_card")!;
    expect(mover).toMatchObject({ total: 2, previas: 1, execucoes: 1 });
    expect(m.skills).toEqual(expect.arrayContaining([{ skill: "cliente", total: 1 }, { skill: "parados", total: 1 }, { skill: "(sem skill)", total: 2 }]));
    // consultas frequentes: só as L1 dos pedidos de consulta
    expect(m.consultasFrequentes).toEqual(expect.arrayContaining([{ tool: "obter_card", total: 2 }, { tool: "listar_cards_parados", total: 1 }]));
  });

  it("dia por Brasília: 22h BRT do dia 24 conta no 24, não no 25", () => {
    const m = buildOpMetrics({
      periodo,
      agora,
      prompts: [prompt({ id: "r1", skill: "cliente", createdAt: new Date("2026-10-25T01:00:00Z") })],
      calls: [],
      approvals: [],
      flows: [],
    });
    const dias = Object.fromEntries(m.totais.porDia.map((d) => [d.dia, d.pedidos]));
    expect(dias["2026-10-24"]).toBe(1);
    expect(dias["2026-10-25"]).toBe(0);
    expect(m.totais.porDia).toHaveLength(7);
  });

  it("aprovações por status efetivo e fluxos (aberto, concluído, parado há > 14 dias = abandonado)", () => {
    const base = newState({ workflow: "prontuario", card: { id: CARD, cardNumber: 4967, colunaId: "lab" }, agora: new Date("2026-10-20T12:00:00Z") });
    const bloq = block(markDone(base, "hospital", { agora: new Date("2026-10-20T12:00:00Z") }), { passo: "pendencias", tipo: "dado_faltante", campos: ["data_acidente"] }, new Date("2026-10-20T12:00:00Z"));
    const velho = newState({ workflow: "procuracao", card: { id: CARD2, cardNumber: 10, colunaId: null }, agora: new Date("2026-09-01T12:00:00Z") });
    // Começou antes do período (10/10) e ainda está aberto: só na lista de parados.
    const antigo = markDone(newState({ workflow: "pedido_prontuario", card: { id: CARD2, cardNumber: 10, colunaId: null }, agora: new Date("2026-10-10T12:00:00Z") }), "card", { agora: new Date("2026-10-24T12:00:00Z") });
    const feito = finish(newState({ workflow: "contrato", card: { id: CARD2, cardNumber: 10, colunaId: null }, agora }), "concluido", agora);
    const m = buildOpMetrics({
      periodo,
      agora,
      prompts: [],
      calls: [],
      approvals: [
        { id: "a1", operatorId: "op1", canal: "email", status: "executada", cardId: CARD, expiresAt: agora, createdAt: agora },
        { id: "a2", operatorId: "op1", canal: "email", status: "pendente", cardId: CARD, expiresAt: new Date("2026-10-25T12:30:00Z"), createdAt: agora },
        { id: "a3", operatorId: "op1", canal: "whatsapp", status: "cancelada", cardId: null, expiresAt: agora, createdAt: agora },
      ],
      flows: [
        { id: "f1", operatorId: "op1", createdAt: new Date(bloq.criadoEm), state: bloq },
        { id: "f2", operatorId: "op1", createdAt: new Date(velho.criadoEm), state: velho },
        { id: "f3", operatorId: "op1", createdAt: agora, state: feito },
        { id: "f4", operatorId: "op1", createdAt: agora, state: { lixo: true } },
        { id: "f5", operatorId: "op1", createdAt: new Date("2026-10-10T12:00:00Z"), state: antigo },
      ],
    });
    expect(m.aprovacoes.porStatus).toEqual({ executada: 1, expirada: 1, cancelada: 1 });
    expect(m.operadores[0].aprovacoes).toMatchObject({ preparadas: 3, executadas: 1, expiradas: 1, canceladas: 1 });
    // Contadores = fluxos começados no período (f2 e f5 são de antes).
    expect(m.fluxos.porStatus).toEqual({ bloqueado: 1, concluido: 1 });
    expect(m.operadores[0].fluxos).toEqual({ abertos: 1, concluidos: 1, abandonados: 0 });
    expect(m.fluxos.parados).toEqual([
      expect.objectContaining({ requestId: "f1", cardNumber: 4967, status: "bloqueado", diasParado: 5, bloqueio: { passo: "pendencias", tipo: "dado_faltante", campos: ["data_acidente"] } }),
      expect.objectContaining({ requestId: "f5", status: "em_andamento", diasParado: 1, bloqueio: null }),
    ]);
    expect(m.fluxos.bloqueios).toEqual([{ motivo: "campo:data_acidente", total: 1 }]);
    expect(flowStatus(velho, agora)).toBe("abandonado");
  });

  it("resultado não carrega texto nem args (só o que entrou)", () => {
    const m = buildOpMetrics({ periodo, agora, prompts: [prompt({ id: "r1", skill: "cliente" })], calls: [call({ id: "c1", requestId: "r1" })], approvals: [], flows: [] });
    const json = JSON.stringify(m);
    expect(json).not.toMatch(/"text"|"args"|"texto"/);
  });
});

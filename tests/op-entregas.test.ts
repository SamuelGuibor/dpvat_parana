import { describe, it, expect } from "vitest";
import {
  OP_ENTREGAS,
  buildOpMetrics,
  entregaDaChamada,
  metaEntregas,
  minutosDe,
  type MetricCall,
  type MetricPrompt,
} from "@/app/_shared/utils/op-metrics";

const CARD = "cmsp9hqlk0001l904y4fyvnku";
const CARD2 = "cmsp9hqlk0002l904y4fyvnku";
// 25/10/2026 10:00 em Brasília (UTC−3).
const agora = new Date("2026-10-25T13:00:00Z");
const periodo = { de: "2026-10-19", ate: "2026-10-25" };

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
const min = (key: string) => OP_ENTREGAS.find((e) => e.key === key)!.minutos;

describe("entregaDaChamada", () => {
  it("documento preparado, envio que saiu e ação confirmada contam; prévia, falha e envio zerado não", () => {
    expect(entregaDaChamada(call({ id: "a", tool: "preparar_procuracao", level: 2, cardIds: [CARD] }))).toMatchObject({ key: "procuracao", n: 1 });
    expect(entregaDaChamada(call({ id: "b", tool: "executar_aprovado", level: 4, envioCanal: "whatsapp", enviados: 7, cardIds: [CARD, CARD2] }))).toEqual({ key: "whatsapp", n: 7 });
    expect(entregaDaChamada(call({ id: "c", tool: "executar_aprovado", level: 4, envioCanal: "e-mail", enviados: 1 }))).toEqual({ key: "email", n: 1 });
    expect(entregaDaChamada(call({ id: "d", tool: "executar_aprovado", level: 4, envioCanal: "whatsapp", enviados: 0 }))).toBeNull();
    expect(entregaDaChamada(call({ id: "e", tool: "mover_card", level: 3, confirmed: true, cardIds: [CARD] }))).toEqual({ key: "card_movido", n: 1 });
    expect(entregaDaChamada(call({ id: "f", tool: "mover_card", level: 3, cardIds: [CARD] }))).toBeNull();
    expect(entregaDaChamada(call({ id: "g", tool: "editar_cadastro", level: 3, confirmed: true, ok: false, code: "estado_mudou" }))).toBeNull();
    expect(entregaDaChamada(call({ id: "h", tool: "adicionar_tag", level: 3, confirmed: true, cardIds: [CARD, CARD2] }))).toEqual({ key: "organizacao", n: 2 });
    expect(entregaDaChamada(call({ id: "i", tool: "obter_card", cardIds: [CARD] }))).toBeNull();
  });

  it("minutos saem só da tabela; meta proporcional ao período", () => {
    expect(minutosDe({ procuracao: 2, whatsapp: 10 })).toBe(2 * min("procuracao") + 10 * min("whatsapp"));
    expect(metaEntregas(7)).toBe(60);
    expect(metaEntregas(1)).toBe(9);
  });
});

describe("buildOpMetrics — entregas, tempo e chats", () => {
  const m = buildOpMetrics({
    periodo,
    agora,
    prompts: [
      prompt({ id: "r1", skill: "procuracao", createdAt: new Date("2026-10-25T12:40:00Z") }),
      prompt({ id: "r2", skill: "cliente", createdAt: new Date("2026-10-25T12:45:00Z") }),
      prompt({ id: "r3", operatorId: "op2", sessionId: "s2", skill: "whatsapp", createdAt: new Date("2026-10-24T15:00:00Z") }),
      // Conversa (sem ferramenta nem skill de operação) não abre chat.
      prompt({ id: "r4", operatorId: "op2", sessionId: "s3", createdAt: new Date("2026-10-25T12:59:00Z") }),
    ],
    calls: [
      // Mesma procuração refeita no mesmo card e dia = 1 entrega.
      call({ id: "c1", requestId: "r1", tool: "preparar_procuracao", level: 2, cardIds: [CARD], createdAt: new Date("2026-10-25T12:40:10Z") }),
      call({ id: "c2", requestId: "r1", tool: "preparar_procuracao", level: 2, cardIds: [CARD], createdAt: new Date("2026-10-25T12:50:00Z") }),
      call({ id: "c3", requestId: "r2", tool: "buscar_cliente", cardIds: [CARD2], createdAt: new Date("2026-10-25T12:45:05Z") }),
      call({ id: "c4", operatorId: "op2", sessionId: "s2", requestId: "r3", tool: "executar_aprovado", level: 4, envioCanal: "whatsapp", enviados: 5, cardIds: [CARD, CARD2], createdAt: new Date("2026-10-24T15:02:00Z") }),
    ],
    approvals: [],
    flows: [],
  });
  const op1 = m.operadores.find((o) => o.operatorId === "op1")!;
  const op2 = m.operadores.find((o) => o.operatorId === "op2")!;

  it("conta entregas por tipo com dedupe de documento e consulta por prompt", () => {
    expect(op1.entregas).toMatchObject({ procuracao: 1, consulta: 1, whatsapp: 0 });
    expect(op2.entregas).toMatchObject({ whatsapp: 5 });
    expect(m.totais.entregas).toMatchObject({ procuracao: 1, consulta: 1, whatsapp: 5 });
  });

  it("tempo economizado = entregas × tabela, por pessoa, total e por dia/grupo", () => {
    expect(op1.minutosPoupados).toBe(min("procuracao") + min("consulta"));
    expect(op2.minutosPoupados).toBe(5 * min("whatsapp"));
    expect(m.totais.minutosPoupados).toBe(op1.minutosPoupados + op2.minutosPoupados);
    const d25 = m.totais.porDia.find((d) => d.dia === "2026-10-25")!;
    const d24 = m.totais.porDia.find((d) => d.dia === "2026-10-24")!;
    expect(d25.minutos).toEqual({ documentos: min("procuracao"), envios: 0, cards: min("consulta") });
    expect(d24.minutos.envios).toBe(5 * min("whatsapp"));
    // Mais tempo poupado primeiro (procuração + consulta > 5 WhatsApps).
    expect(m.operadores.map((o) => o.operatorId)).toEqual(["op1", "op2"]);
  });

  it("chat ativo até 30 min sem uso; depois fechado; conversa não conta", () => {
    expect(op1).toMatchObject({ chatsAtivos: 1, chatsFechados: 0 });
    expect(op2).toMatchObject({ chatsAtivos: 0, chatsFechados: 1 });
    expect(m.chats.map((c) => c.sessionId)).toEqual(["s1", "s2"]);
    expect(m.chats[0]).toMatchObject({ ativo: true, pedidos: 2, entregas: 2, totalCards: 2, ultimo: "2026-10-25T12:50:00.000Z" });
    expect(["procuracao", "cliente"]).toContain(m.chats[0].skill);
    expect(m.chats[1]).toMatchObject({ ativo: false, skill: "whatsapp", entregas: 5 });
    expect(m.metaEntregas).toBe(60);
  });
});

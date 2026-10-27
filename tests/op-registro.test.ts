import { describe, expect, it } from "vitest";
import { avisosDoResultado, previaHashEmitido, previaHashRecebido, registroDaChamada } from "@/app/_shared/utils/op-registro";
import { buildIgnorados, type MetricCall } from "@/app/_shared/utils/op-metrics";

// Item G (27/10): o que a rota guarda por chamada (hash da prévia + avisos em
// código) e como o painel deriva "o que o operador ignorou".

describe("registro da chamada (op-registro)", () => {
  it("hash: emitido na prévia (data.previa_hash ou data.previa.previa_hash) vence o recebido nos args", () => {
    expect(previaHashEmitido({ previa_hash: "abc" })).toBe("abc");
    expect(previaHashEmitido({ previa: { previa_hash: "def" } })).toBe("def");
    expect(previaHashEmitido({ previa: {} })).toBeNull();
    expect(previaHashRecebido({ card: "1", previa_hash: "x1" })).toBe("x1");
    expect(registroDaChamada({ args: { previa_hash: "r" }, data: { previa_hash: "e" } }).previaHash).toBe("e");
    expect(registroDaChamada({ args: { previa_hash: "r" }, data: { feito: true } }).previaHash).toBe("r");
  });

  it("avisos viram códigos curtos, nunca texto", () => {
    const avisos = avisosDoResultado(
      {
        aviso: "Nada saiu. Corrija.",
        previa: { requerConfirmacao: true, destinoLivre: true, avisos: ["Template de categoria MARKETING: a Meta pode bloquear."] },
        lote: { pulados: [{ card: "1" }, { card: "2" }] },
        naoEnviados: 3,
      },
      "requer_confirmacao",
    );
    expect(avisos).toEqual(["requer_confirmacao", "aviso", "destino_livre", "marketing", "pulados:2", "nao_enviados:3"]);
    for (const a of avisos) expect(a.length).toBeLessThanOrEqual(40);
    expect(avisosDoResultado({ card: { cardNumber: 1 } })).toEqual([]);
    expect(avisosDoResultado(null)).toEqual([]);
  });
});

function call(over: Partial<MetricCall> & { id: string; at: string }): MetricCall {
  const { at, ...rest } = over;
  return {
    operatorId: "op1",
    requestId: null,
    sessionId: "s1",
    tool: "mover_card",
    level: 3,
    ok: true,
    code: null,
    confirmed: false,
    noop: false,
    cardIds: ["c1"],
    durationMs: 10,
    previaHash: null,
    avisos: [],
    ...rest,
    createdAt: new Date(at),
  };
}

describe("ignorados (buildIgnorados)", () => {
  it("prévia exigida sem chamada confirmada com o mesmo hash conta; com confirmação não conta", () => {
    const calls = [
      call({ id: "a", at: "2026-10-27T10:00:00Z", ok: false, code: "requer_confirmacao", previaHash: "h1", avisos: ["requer_confirmacao"] }),
      call({ id: "b", at: "2026-10-27T10:01:00Z", ok: true, confirmed: true, previaHash: "h1" }),
      call({ id: "c", at: "2026-10-27T10:05:00Z", ok: false, code: "requer_confirmacao", previaHash: "h2", avisos: ["requer_confirmacao"], cardIds: ["c9"], operatorId: "op2" }),
    ];
    const ig = buildIgnorados(calls);
    expect(ig.previasNaoConfirmadas.map((i) => i.id)).toEqual(["c"]);
    expect(ig.previasNaoConfirmadas[0]).toMatchObject({ operatorId: "op2", cardId: "c9", tool: "mover_card", avisos: ["requer_confirmacao"] });
    expect(ig.porOperador).toEqual({ op2: { previasNaoConfirmadas: 1, enviosComAviso: 0, cardsPulados: 0 } });
  });

  it("confirmação de OUTRA ferramenta com o mesmo hash não conta como confirmada", () => {
    const calls = [
      call({ id: "a", at: "2026-10-27T10:00:00Z", ok: false, code: "requer_confirmacao", previaHash: "h1", avisos: ["requer_confirmacao"] }),
      call({ id: "b", at: "2026-10-27T10:01:00Z", ok: true, confirmed: true, previaHash: "h1", tool: "editar_cadastro" }),
    ];
    expect(buildIgnorados(calls).previasNaoConfirmadas).toHaveLength(1);
  });

  it("envio executado depois de um preparar com aviso (marketing/destino_livre) na mesma sessão conta; sem envio não conta", () => {
    const calls = [
      call({ id: "p1", at: "2026-10-27T10:00:00Z", tool: "preparar_whatsapp", level: 4, avisos: ["marketing", "aviso"] }),
      call({ id: "e1", at: "2026-10-27T10:02:00Z", tool: "executar_aprovado", level: 4 }),
      call({ id: "p2", at: "2026-10-27T11:00:00Z", tool: "preparar_email", level: 4, avisos: ["destino_livre"], sessionId: "s2" }),
      call({ id: "p3", at: "2026-10-27T12:00:00Z", tool: "preparar_email", level: 4, avisos: ["destino_livre"], sessionId: "s3" }),
      call({ id: "e3", at: "2026-10-27T11:59:00Z", tool: "executar_aprovado", level: 4, sessionId: "s3" }), // antes do preparar: não é dele
    ];
    const ig = buildIgnorados(calls);
    expect(ig.enviosComAviso.map((i) => i.id)).toEqual(["p1"]);
    expect(ig.porOperador.op1.enviosComAviso).toBe(1);
  });

  it("soma cards pulados e não enviados pelos códigos", () => {
    const calls = [
      call({ id: "p1", at: "2026-10-27T10:00:00Z", tool: "preparar_whatsapp", level: 4, avisos: ["pulados:3"] }),
      call({ id: "e1", at: "2026-10-27T10:02:00Z", tool: "executar_aprovado", level: 4, avisos: ["nao_enviados:2", "aviso"], operatorId: "op2" }),
    ];
    const ig = buildIgnorados(calls);
    expect(ig.cardsPulados).toBe(3);
    expect(ig.naoEnviados).toBe(2);
    expect(ig.porOperador.op1.cardsPulados).toBe(3);
  });

  it("linha sem avisos nunca entra", () => {
    const ig = buildIgnorados([call({ id: "x", at: "2026-10-27T10:00:00Z", ok: false, code: "requer_confirmacao", previaHash: "h" })]);
    expect(ig.previasNaoConfirmadas).toHaveLength(0);
  });
});

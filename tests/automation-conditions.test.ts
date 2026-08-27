import { describe, expect, it } from "vitest";
import type { AutomationCondition } from "@/app/_shared/lib/db/automations";
import {
  daysUntilDue, evalConditions, fireCycleKey,
} from "@/app/_shared/lib/automation-conditions";

// Regressão do motivo pelo qual NENHUM aviso de prazo saiu entre a criação das
// automações e 27/08/2026: o cálculo invertia o sinal (data futura virava
// número negativo) e comparava instantes em vez de dias de calendário.

/** Meia-noite UTC — é assim que o campo de data do card é gravado. */
const dueOn = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** Um instante qualquer do dia, em horário de Brasília. */
const brInstant = (iso: string, hourBr: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  // Brasília = UTC-3 (sem horário de verão desde 2019).
  return new Date(Date.UTC(y, m - 1, d, hourBr + 3, 0, 0));
};

const due = (cond: Partial<AutomationCondition>): AutomationCondition[] => [
  { field: "__due_date__", operator: "beforeDueDate", value: "5", ...cond } as AutomationCondition,
];

describe("daysUntilDue", () => {
  it("conta positivo para data futura", () => {
    expect(daysUntilDue(dueOn("2026-09-01"), brInstant("2026-08-27", 13))).toBe(5);
  });

  it("é 0 no dia do vencimento, inclusive à noite em Brasília", () => {
    expect(daysUntilDue(dueOn("2026-09-01"), brInstant("2026-09-01", 8))).toBe(0);
    expect(daysUntilDue(dueOn("2026-09-01"), brInstant("2026-09-01", 22))).toBe(0);
  });

  it("é negativo depois de vencer", () => {
    expect(daysUntilDue(dueOn("2026-09-01"), brInstant("2026-09-04", 10))).toBe(-3);
  });

  it("não vira o dia por causa do UTC da Vercel (22h de Brasília = dia seguinte em UTC)", () => {
    // 27/08 às 22h em Brasília é 28/08 01:00 UTC — o dia certo ainda é 27.
    expect(daysUntilDue(dueOn("2026-08-28"), brInstant("2026-08-27", 22))).toBe(1);
  });
});

describe("condição de vencimento", () => {
  const card = { afastadoAte: dueOn("2026-09-01") };

  it("dispara no dia exato configurado", () => {
    expect(evalConditions(due({ value: "5" }), "AND", card, [], brInstant("2026-08-27", 13))).toBe(true);
  });

  it("não dispara antes nem depois do dia configurado", () => {
    expect(evalConditions(due({ value: "5" }), "AND", card, [], brInstant("2026-08-25", 13))).toBe(false);
    expect(evalConditions(due({ value: "5" }), "AND", card, [], brInstant("2026-08-29", 13))).toBe(false);
  });

  it("a automação de 10 dias não dispara junto com a de 5", () => {
    const dia5 = brInstant("2026-08-27", 9);
    expect(evalConditions(due({ value: "10" }), "AND", card, [], dia5)).toBe(false);
    expect(evalConditions(due({ value: "5" }), "AND", card, [], dia5)).toBe(true);
  });

  it("'venceu há mais de N' só vale depois do vencimento", () => {
    const conds = due({ operator: "afterDueDate", value: "2" });
    expect(evalConditions(conds, "AND", card, [], brInstant("2026-08-27", 13))).toBe(false);
    expect(evalConditions(conds, "AND", card, [], brInstant("2026-09-04", 13))).toBe(true);
  });

  it("card sem data de vencimento nunca dispara", () => {
    expect(evalConditions(due({ value: "5" }), "AND", { afastadoAte: null }, [], brInstant("2026-08-27", 13))).toBe(false);
  });
});

describe("fireCycleKey", () => {
  it("muda quando a data de vencimento muda (o aviso rearma)", () => {
    const conds = due({ value: "5" });
    const antes = fireCycleKey(conds, { afastadoAte: dueOn("2026-09-01") });
    const depois = fireCycleKey(conds, { afastadoAte: dueOn("2026-12-01") });
    expect(antes).not.toBe(depois);
  });

  it("é estável enquanto a data não muda (não repete o aviso)", () => {
    const conds = due({ value: "5" });
    expect(fireCycleKey(conds, { afastadoAte: dueOn("2026-09-01") }))
      .toBe(fireCycleKey(conds, { afastadoAte: dueOn("2026-09-01") }));
  });
});

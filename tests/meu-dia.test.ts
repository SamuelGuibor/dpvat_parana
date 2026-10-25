import { describe, it, expect } from "vitest";
import { aggregateMeuDia, isParado } from "@/app/_shared/utils/meu-dia";

const card = (over: Partial<Parameters<typeof aggregateMeuDia>[0][number]>) => ({
  id: "c",
  cardNumber: 1,
  nome: "x",
  coluna: "A",
  diasNaColuna: 1,
  prazoColunaDias: 5,
  arquivado: null,
  ultimoToque: new Date("2026-10-20T12:00:00Z"),
  ...over,
});

describe("meu dia", () => {
  it("parado = passou do prazo (sem prazo: 7)", () => {
    expect(isParado(6, 5)).toBe(true);
    expect(isParado(5, 5)).toBe(false);
    expect(isParado(8, null)).toBe(true);
    expect(isParado(null, 1)).toBe(false);
  });

  it("tira arquivados, parados primeiro (mais atrasado antes), depois toque recente", () => {
    const out = aggregateMeuDia([
      card({ id: "recente", ultimoToque: new Date("2026-10-24T12:00:00Z") }),
      card({ id: "arq", arquivado: "pagos_ccs", diasNaColuna: 99 }),
      card({ id: "parado2", diasNaColuna: 7 }),
      card({ id: "parado10", diasNaColuna: 15 }),
      card({ id: "antigo" }),
    ]);
    expect(out.map((c) => c.id)).toEqual(["parado10", "parado2", "recente", "antigo"]);
    expect(out[0]).toMatchObject({ parado: true, diasAlemDoPrazo: 10 });
    expect(out[2]).toMatchObject({ parado: false, diasAlemDoPrazo: null });
    expect("ultimoToque" in out[0]).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { sseReconnectDelayMs } from "@/app/_shared/utils/sse-reconnect";

describe("sseReconnectDelayMs", () => {
  it("dobra a espera a cada falha seguida, a partir de 3 s", () => {
    expect([1, 2, 3, 4, 5].map(sseReconnectDelayMs)).toEqual([3_000, 6_000, 12_000, 24_000, 48_000]);
  });

  it("para em 60 s: relay quebrado vira 1 pedido de token por minuto por aba", () => {
    expect(sseReconnectDelayMs(6)).toBe(60_000);
    expect(sseReconnectDelayMs(50)).toBe(60_000);
    expect(sseReconnectDelayMs(Number.MAX_SAFE_INTEGER)).toBe(60_000);
  });

  it("contagem inválida volta à primeira espera", () => {
    expect(sseReconnectDelayMs(0)).toBe(3_000);
    expect(sseReconnectDelayMs(-2)).toBe(3_000);
    expect(sseReconnectDelayMs(Number.NaN)).toBe(3_000);
    expect(sseReconnectDelayMs(Number.POSITIVE_INFINITY)).toBe(3_000);
  });

  it("fração arredonda para baixo", () => {
    expect(sseReconnectDelayMs(2.9)).toBe(6_000);
  });
});

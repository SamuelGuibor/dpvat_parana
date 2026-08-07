import { describe, it, expect } from "vitest";
import {
  brDayKey, brDayKeySeries, brLabelFromKey, brMonthIndex, brStartOfDay, brStartOfDaysAgo,
} from "@/app/_shared/utils/date-br";

// O cenário do bug: em produção o Node roda em UTC. Às 22:39 de 06/08 em
// Brasília já é 01:39 de 07/08 em UTC — e o gráfico abria o bucket de 07/08
// enquanto no Brasil ainda era dia 6.
const NOITE_DE_06_08 = new Date("2026-08-07T01:39:00.000Z"); // 22:39 BRT do dia 06

describe("datas no fuso de Brasília", () => {
  it("22:39 de 06/08 (BRT) ainda é o dia 06, não o 07", () => {
    expect(brDayKey(NOITE_DE_06_08)).toBe("2026-08-06");
    // A leitura ingênua (UTC) é a que estava errada:
    expect(NOITE_DE_06_08.toISOString().slice(0, 10)).toBe("2026-08-07");
  });

  it("00:30 UTC ainda é o dia anterior no Brasil", () => {
    expect(brDayKey(new Date("2026-01-01T00:30:00.000Z"))).toBe("2025-12-31");
  });

  it("a meia-noite de Brasília é 03:00 UTC", () => {
    expect(brStartOfDay(NOITE_DE_06_08).toISOString()).toBe("2026-08-06T03:00:00.000Z");
  });

  it("brStartOfDaysAgo anda em dias inteiros de Brasília", () => {
    expect(brStartOfDaysAgo(0, NOITE_DE_06_08).toISOString()).toBe("2026-08-06T03:00:00.000Z");
    expect(brStartOfDaysAgo(6, NOITE_DE_06_08).toISOString()).toBe("2026-07-31T03:00:00.000Z");
  });

  it("a série de dias termina HOJE (Brasília) e não em amanhã", () => {
    const serie = brDayKeySeries(7, NOITE_DE_06_08);
    expect(serie).toHaveLength(7);
    expect(serie[6]).toBe("2026-08-06");
    expect(serie[0]).toBe("2026-07-31");
    expect(serie).not.toContain("2026-08-07");
  });

  it("rótulo curto sai de dia/mês sem reinterpretar fuso", () => {
    expect(brLabelFromKey("2026-08-06")).toBe("06/08");
  });

  it("evento do dia 31 às 22h conta no mês certo", () => {
    // 31/07 22:00 BRT = 01:00 UTC de 01/08 — o getMonth() dava agosto.
    expect(brMonthIndex(new Date("2026-08-01T01:00:00.000Z"))).toBe(6); // julho
  });
});

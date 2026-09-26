import { describe, it, expect } from "vitest";
import {
  brBusinessMinutesBetween, brDayKey, brDayKeySeries, brDayRangeToInstants, brLabelFromKey, brMonthIndex,
  brStartOfDay, brStartOfDaysAgo, isBrBusinessHour, nextBrBusinessSlot,
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

// Filtro "Data de entrada" do inbox no servidor: os dias são de Brasília e o
// fim é exclusivo na meia-noite BRT do dia seguinte. new Date('YYYY-MM-DD')
// seria meia-noite UTC (21h do dia anterior em Brasília).
describe("brDayRangeToInstants (dias de Brasília → instantes do banco)", () => {
  it("intervalo inclusivo: 00:00 BRT do início até 00:00 BRT do dia seguinte ao fim", () => {
    const r = brDayRangeToInstants("2026-09-01", "2026-09-24");
    expect(r.gte.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(r.lt.toISOString()).toBe("2026-09-25T03:00:00.000Z");
  });

  it("de = até é um dia só (24 h)", () => {
    const r = brDayRangeToInstants("2026-09-26", "2026-09-26");
    expect(r.gte.toISOString()).toBe("2026-09-26T03:00:00.000Z");
    expect(r.lt.toISOString()).toBe("2026-09-27T03:00:00.000Z");
  });

  it("vira o mês e o ano sem se perder", () => {
    expect(brDayRangeToInstants("2026-09-30", "2026-09-30").lt.toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(brDayRangeToInstants("2026-12-31", "2026-12-31").lt.toISOString()).toBe("2027-01-01T03:00:00.000Z");
  });

  it("uma conversa das 22h do último dia (01:00Z do dia seguinte) fica dentro", () => {
    const r = brDayRangeToInstants("2026-09-01", "2026-09-24");
    const t = Date.parse("2026-09-25T01:00:00.000Z"); // 22:00 BRT de 24/09
    expect(t >= r.gte.getTime() && t < r.lt.getTime()).toBe(true);
  });

  it("dia fora do formato lança (nunca vira 'sem filtro' em silêncio)", () => {
    expect(() => brDayRangeToInstants("2026-9-1", "2026-09-24")).toThrow(RangeError);
    expect(() => brDayRangeToInstants("2026-09-01", "")).toThrow(RangeError);
  });
});

// Horário comercial dos crons do WhatsApp (7h–21h BRT, todos os dias). A
// despedida "vou encerrar seu atendimento" saía às 23h porque o cron de
// silêncio não olhava a hora; estas funções são a régua dele e da recuperação.
describe("horário comercial dos crons (7h–21h de Brasília)", () => {
  it("abre às 07:00 e fecha às 21:00 (BRT)", () => {
    expect(isBrBusinessHour(new Date("2026-09-10T09:59:00.000Z"))).toBe(false); // 06:59
    expect(isBrBusinessHour(new Date("2026-09-10T10:00:00.000Z"))).toBe(true); // 07:00
    expect(isBrBusinessHour(new Date("2026-09-10T23:59:00.000Z"))).toBe(true); // 20:59
    expect(isBrBusinessHour(new Date("2026-09-11T00:00:00.000Z"))).toBe(false); // 21:00
    // Aceita o timestamp numérico que o cron usa (Date.now()).
    expect(isBrBusinessHour(Date.parse("2026-09-10T15:00:00.000Z"))).toBe(true); // 12:00
  });

  it("depois das 21h o próximo horário é às 7h do dia seguinte", () => {
    // 23:30 BRT de 10/09 = 02:30Z de 11/09 → 07:00 BRT de 11/09 = 10:00Z.
    expect(nextBrBusinessSlot(Date.parse("2026-09-11T02:30:00.000Z")).toISOString())
      .toBe("2026-09-11T10:00:00.000Z");
    // 21:00 em ponto já está fora.
    expect(nextBrBusinessSlot(Date.parse("2026-09-11T00:00:00.000Z")).toISOString())
      .toBe("2026-09-11T10:00:00.000Z");
  });

  it("de madrugada o próximo horário é às 7h do mesmo dia", () => {
    // 05:00 BRT de 11/09 = 08:00Z.
    expect(nextBrBusinessSlot(Date.parse("2026-09-11T08:00:00.000Z")).toISOString())
      .toBe("2026-09-11T10:00:00.000Z");
  });

  it("dentro do horário devolve o próprio instante", () => {
    const at = Date.parse("2026-09-11T14:37:12.345Z"); // 11:37 BRT
    expect(nextBrBusinessSlot(at).getTime()).toBe(at);
  });

  it("vira o mês sem se perder (30/09 22h → 01/10 7h)", () => {
    // 30/09 22:00 BRT = 01:00Z de 01/10.
    expect(nextBrBusinessSlot(Date.parse("2026-10-01T01:00:00.000Z")).toISOString())
      .toBe("2026-10-01T10:00:00.000Z");
  });

  it("minutos de expediente: a madrugada não conta", () => {
    // 20:00 BRT de 10/09 → 08:00 BRT de 11/09 = 60 min (20h–21h) + 60 min (7h–8h).
    expect(brBusinessMinutesBetween(
      Date.parse("2026-09-10T23:00:00.000Z"), Date.parse("2026-09-11T11:00:00.000Z"),
    )).toBe(120);
    // Só madrugada (22h → 06h) = 0.
    expect(brBusinessMinutesBetween(
      Date.parse("2026-09-11T01:00:00.000Z"), Date.parse("2026-09-11T09:00:00.000Z"),
    )).toBe(0);
    // Dois dias inteiros (07h de 10/09 → 07h de 12/09) = 2 × 14 h.
    expect(brBusinessMinutesBetween(
      Date.parse("2026-09-10T10:00:00.000Z"), Date.parse("2026-09-12T10:00:00.000Z"),
    )).toBe(2 * 14 * 60);
    expect(brBusinessMinutesBetween(1000, 1000)).toBe(0);
    expect(brBusinessMinutesBetween(2000, 1000)).toBe(0);
  });

  it("dá o mesmo resultado da régua antiga do cron (offset fixo de −3 h)", () => {
    // Cópia da versão que vivia em cron-tasks.ts, para provar que a troca não
    // muda o comportamento (o Brasil não tem horário de verão desde 2019).
    const OFF = -3 * 60 * 60_000;
    const oldIsBusiness = (ts: number) => {
      const h = new Date(ts + OFF).getUTCHours();
      return h >= 7 && h < 21;
    };
    const oldNextSlot = (ts: number) => {
      if (oldIsBusiness(ts)) return ts;
      const wall = new Date(ts + OFF);
      const dayStart = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
      const addDays = wall.getUTCHours() < 7 ? 0 : 1;
      return dayStart + addDays * 86_400_000 + 7 * 3_600_000 - OFF;
    };
    const oldMinutes = (from: number, to: number) => {
      if (to <= from) return 0;
      let total = 0;
      let cursor = from;
      while (cursor < to) {
        const wall = new Date(cursor + OFF);
        const dayStart = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()) - OFF;
        const segStart = Math.max(cursor, dayStart + 7 * 3_600_000);
        const segEnd = Math.min(to, dayStart + 21 * 3_600_000);
        if (segEnd > segStart) total += segEnd - segStart;
        cursor = dayStart + 86_400_000;
      }
      return Math.round(total / 60_000);
    };
    // Varre 3 dias (inclui virada de mês e de ano) de 7 em 7 minutos.
    for (const startIso of ["2026-09-29T00:00:00.000Z", "2026-12-30T00:00:00.000Z"]) {
      const start = Date.parse(startIso);
      for (let ts = start; ts < start + 3 * 86_400_000; ts += 7 * 60_000) {
        expect(isBrBusinessHour(ts)).toBe(oldIsBusiness(ts));
        expect(nextBrBusinessSlot(ts).getTime()).toBe(oldNextSlot(ts));
        expect(brBusinessMinutesBetween(start, ts)).toBe(oldMinutes(start, ts));
      }
    }
  });
});

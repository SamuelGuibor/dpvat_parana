import { describe, it, expect } from "vitest";
import {
  breakMinutes, clockToIso, dayEndMs, daysOfMonth, fmtHm, fmtSigned,
  monthSummary, parseBreaks, parseSchedule, statusOf, targetMinutes,
  weekdayOf, workedMinutes,
  type PontoSession,
} from "@/app/_shared/lib/ponto";

// O cálculo do ponto é o que vira folha de pagamento: um erro de fuso ou uma
// pausa em aberto contando até a meia-noite viram hora a mais no bolso de
// alguém. Estes testes fixam o comportamento nas bordas.

const DIA = "2026-08-13"; // quinta-feira

/** Sessão do dia com horários em HH:MM (Brasília). */
function ws(over: Partial<PontoSession> & { start?: string; end?: string; pausas?: [string, string | null][] } = {}): PontoSession {
  const { start = "08:00", end, pausas = [], ...rest } = over;
  return {
    id: "s1", userId: "u1", discordId: "u1", date: DIA,
    startedAt: clockToIso(DIA, start),
    pausedAt: null, resumedAt: null,
    finishedAt: end ? clockToIso(DIA, end) : null,
    isActive: !end, isPaused: false,
    breaks: pausas.map(([a, b]) => ({ start: clockToIso(DIA, a), end: b ? clockToIso(DIA, b) : null, kind: "almoco" })),
    ...rest,
  } as PontoSession;
}

const AGORA_15H = new Date(clockToIso(DIA, "15:00")!).getTime();

describe("workedMinutes", () => {
  it("desconta uma pausa fechada", () => {
    // 08:00→18:00 = 10h, menos 1h de almoço = 9h
    expect(workedMinutes(ws({ start: "08:00", end: "18:00", pausas: [["12:00", "13:00"]] }))).toBe(540);
  });

  it("desconta VÁRIAS pausas no mesmo dia (o que o modelo antigo não fazia)", () => {
    const s = ws({ start: "08:00", end: "18:00", pausas: [["12:00", "13:00"], ["15:30", "15:45"]] });
    expect(workedMinutes(s)).toBe(540 - 15);
    expect(breakMinutes(s)).toBe(75);
  });

  it("conta o turno em aberto só até agora", () => {
    expect(workedMinutes(ws({ start: "08:00" }), AGORA_15H)).toBe(420);
  });

  it("não deixa a pausa em aberto engolir o resto do dia", () => {
    // Saiu para almoçar 12:00 e não voltou; às 15:00 trabalhou 4h, não 7h.
    expect(workedMinutes(ws({ start: "08:00", pausas: [["12:00", null]] }), AGORA_15H)).toBe(240);
  });

  it("limita o turno esquecido em aberto à virada do dia", () => {
    const amanha = new Date(clockToIso(DIA, "08:00")!).getTime() + 30 * 3600_000;
    // 08:00 → 23:59:59 = 15h59, nunca mais que isso.
    expect(workedMinutes(ws({ start: "08:00" }), amanha)).toBe(959);
  });

  it("é imune a pausa fora da janela do turno", () => {
    const s = ws({ start: "09:00", end: "17:00", pausas: [["07:00", "08:00"], ["18:00", "19:00"]] });
    expect(workedMinutes(s)).toBe(480);
  });
});

describe("parseBreaks", () => {
  it("lê o par legado pausedAt/resumedAt de registros antigos", () => {
    const legado = {
      breaks: null,
      pausedAt: clockToIso(DIA, "12:00"),
      resumedAt: clockToIso(DIA, "13:00"),
    } as unknown as PontoSession;
    const [pausa] = parseBreaks(legado);
    expect(pausa.kind).toBe("almoco");
    expect(parseBreaks(legado)).toHaveLength(1);
  });

  it("calcula certo um registro legado inteiro", () => {
    const legado = {
      ...ws({ start: "08:00", end: "17:00" }),
      breaks: null,
      pausedAt: clockToIso(DIA, "12:00"),
      resumedAt: clockToIso(DIA, "13:00"),
    } as PontoSession;
    expect(workedMinutes(legado)).toBe(480);
  });

  it("ignora entradas corrompidas em vez de quebrar a tela", () => {
    const sujo = { breaks: [{ start: "nada" }, null, { start: clockToIso(DIA, "12:00"), end: null }], pausedAt: null, resumedAt: null };
    expect(parseBreaks(sujo as unknown as PontoSession)).toHaveLength(1);
  });
});

describe("statusOf", () => {
  it("distingue os quatro estados do dia", () => {
    expect(statusOf(null)).toBe("nao_iniciado");
    expect(statusOf(ws({ start: "08:00" }))).toBe("trabalhando");
    expect(statusOf(ws({ start: "08:00", pausas: [["12:00", null]] }))).toBe("pausa");
    expect(statusOf(ws({ start: "08:00", end: "17:00" }))).toBe("encerrado");
  });
});

describe("jornada esperada", () => {
  it("2026-08-13 é quinta", () => {
    expect(weekdayOf("2026-08-13")).toBe(4);
  });

  it("fim de semana não tem meta", () => {
    const s = parseSchedule({ dailyMinutes: 480, days: [1, 2, 3, 4, 5] });
    expect(targetMinutes("2026-08-13", s)).toBe(480); // quinta
    expect(targetMinutes("2026-08-15", s)).toBe(0);   // sábado
  });

  it("cai no padrão diante de JSON inválido", () => {
    expect(parseSchedule(null)).toEqual({ dailyMinutes: 480, days: [1, 2, 3, 4, 5] });
    expect(parseSchedule({ dailyMinutes: -5, days: [] })).toEqual({ dailyMinutes: 480, days: [1, 2, 3, 4, 5] });
  });

  it("agosto/2026 tem 31 dias", () => {
    expect(daysOfMonth("2026-08")).toHaveLength(31);
    expect(daysOfMonth("2026-02")).toHaveLength(28);
  });
});

describe("monthSummary", () => {
  const schedule = parseSchedule({ dailyMinutes: 480, days: [1, 2, 3, 4, 5] });

  it("acumula saldo e não cobra dias futuros", () => {
    // 10/08 (seg) 9h e 11/08 (ter) 8h; "hoje" é 11/08.
    const sessions = [
      { ...ws({ start: "08:00", end: "18:00", pausas: [["12:00", "13:00"]] }), date: "2026-08-10" },
      { ...ws({ start: "08:00", end: "17:00", pausas: [["12:00", "13:00"]] }), date: "2026-08-11" },
    ] as PontoSession[];

    const r = monthSummary(sessions, schedule, "2026-08", "2026-08-11");
    expect(r.daysWorked).toBe(2);
    expect(r.worked).toBe(540 + 480);
    // 7 dias úteis decorridos (03–07 e 10–11); 08 e 09 são fim de semana e o
    // resto do mês é futuro — futuro nunca entra na meta.
    expect(r.expected).toBe(7 * 480);
    expect(r.missingDays).toEqual(["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07"]);
    expect(r.balance).toBe(1020 - 7 * 480);
  });

  it("só com os dias registrados, os dois dias fecham em +1h", () => {
    const sessions = [
      { ...ws({ start: "08:00", end: "18:00", pausas: [["12:00", "13:00"]] }), date: "2026-08-10" },
      { ...ws({ start: "08:00", end: "17:00", pausas: [["12:00", "13:00"]] }), date: "2026-08-11" },
    ] as PontoSession[];

    const r = monthSummary(sessions, schedule, "2026-08", "2026-08-11", true);
    expect(r.expected).toBe(960);
    expect(r.balance).toBe(60);
  });

  it("marca dia útil sem registro como falta e cobra no saldo", () => {
    const r = monthSummary([], schedule, "2026-08", "2026-08-11");
    expect(r.missingDays).toEqual(["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07", "2026-08-10", "2026-08-11"]);
    expect(r.balance).toBe(-7 * 480);
  });

  it("com onlyRegistered não cobra os dias em branco", () => {
    const r = monthSummary([], schedule, "2026-08", "2026-08-11", true);
    expect(r.expected).toBe(0);
    expect(r.balance).toBe(0);
    expect(r.missingDays).toHaveLength(7); // ainda lista, só não cobra
  });
});

describe("fuso de Brasília", () => {
  it("o fim do dia é 23:59:59.999 em Brasília, não em UTC", () => {
    // 2026-08-13 23:59:59.999 BRT = 2026-08-14 02:59:59.999 UTC
    expect(new Date(dayEndMs(DIA)).toISOString()).toBe("2026-08-14T02:59:59.999Z");
  });

  it("clockToIso ancora o horário no dia certo", () => {
    expect(clockToIso(DIA, "08:00")).toBe("2026-08-13T11:00:00.000Z");
    expect(clockToIso(DIA, "25:00")).toBeNull();
    expect(clockToIso(DIA, "abc")).toBeNull();
  });
});

describe("formatação", () => {
  it("fmtHm e fmtSigned", () => {
    expect(fmtHm(540)).toBe("9h00");
    expect(fmtHm(65)).toBe("1h05");
    expect(fmtSigned(80)).toBe("+1h20");
    expect(fmtSigned(-35)).toBe("−0h35");
    expect(fmtSigned(0)).toBe("0h00");
  });
});

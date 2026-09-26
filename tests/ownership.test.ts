import { describe, expect, it } from "vitest";
import {
  DEFAULT_HUMAN_HOLD_DAYS,
  holdDaysLabel,
  humanHoldMs,
  humanLastVerdict,
  pickOwner,
} from "@/app/_shared/utils/ownership";

// Dono pegajoso (EF-1): devolver ao bot, reabrir e transferir mantêm o último
// atendente; o cron de silêncio não encerra por silêncio quando a última fala
// é humana dentro da janela, e depois dela encerra direto (sem standby).

const DAY = 24 * 60 * 60_000;

describe("pickOwner", () => {
  it("o atribuído vence quando ainda é da equipe", () => {
    expect(pickOwner("A", "B", new Set(["A", "B"]))).toBe("A");
  });

  it("atribuído que saiu da equipe → o autor da última mensagem humana", () => {
    expect(pickOwner("X", "B", new Set(["B"]))).toBe("B");
  });

  it("sem atribuído → o autor da última mensagem humana", () => {
    expect(pickOwner(null, "B", new Set(["B"]))).toBe("B");
  });

  it("ninguém da equipe → Fila sem dono", () => {
    expect(pickOwner(null, null, new Set(["A"]))).toBeNull();
    expect(pickOwner(null, "C", new Set(["A"]))).toBeNull();
    expect(pickOwner("X", "C", new Set<string>())).toBeNull();
  });
});

describe("humanHoldMs (WA_HUMAN_HOLD_DAYS)", () => {
  it("sem a env = 7 dias (ligado por padrão)", () => {
    expect(humanHoldMs(undefined)).toBe(DEFAULT_HUMAN_HOLD_DAYS * DAY);
    expect(humanHoldMs("")).toBe(7 * DAY);
    expect(humanHoldMs("  ")).toBe(7 * DAY);
  });

  it("número de dias, com vírgula ou ponto", () => {
    expect(humanHoldMs("3")).toBe(3 * DAY);
    expect(humanHoldMs("1,5")).toBe(1.5 * DAY);
    expect(humanHoldMs("0.5")).toBe(0.5 * DAY);
  });

  it("0/false/off desligam", () => {
    for (const v of ["0", "false", "off", "não", "OFF"]) expect(humanHoldMs(v)).toBe(0);
  });

  it("lixo ou negativo cai no padrão; acima de 30 dias é cortado", () => {
    expect(humanHoldMs("abc")).toBe(7 * DAY);
    expect(humanHoldMs("-2")).toBe(7 * DAY);
    expect(humanHoldMs("70")).toBe(30 * DAY);
  });
});

describe("humanLastVerdict", () => {
  const now = Date.parse("2026-09-25T15:00:00.000Z");

  it("dentro da janela: para até última fala + janela", () => {
    const last = now - 90 * 60_000;
    expect(humanLastVerdict(last, now, 7 * DAY)).toEqual({ kind: "hold", untilMs: last + 7 * DAY });
  });

  it("passou da janela: encerra direto (sem standby)", () => {
    expect(humanLastVerdict(now - 7 * DAY, now, 7 * DAY)).toEqual({ kind: "close" });
    expect(humanLastVerdict(now - 8 * DAY, now, 7 * DAY)).toEqual({ kind: "close" });
  });

  it("interruptor desligado: fluxo antigo", () => {
    expect(humanLastVerdict(now - 90 * 60_000, now, 0)).toEqual({ kind: "legacy" });
  });

  it("a reavaliação marcada no hold já cai em 'close'", () => {
    const last = now - 60 * 60_000;
    const verdict = humanLastVerdict(last, now, 7 * DAY);
    if (verdict.kind !== "hold") throw new Error("esperava hold");
    // O cron só volta a pegar a conversa 60 min depois do marcador.
    expect(humanLastVerdict(last, verdict.untilMs + 60 * 60_000, 7 * DAY)).toEqual({ kind: "close" });
  });
});

describe("holdDaysLabel", () => {
  it("singular abaixo de 2, vírgula decimal", () => {
    expect(holdDaysLabel(7 * DAY)).toBe("7 dias");
    expect(holdDaysLabel(DAY)).toBe("1 dia");
    expect(holdDaysLabel(1.5 * DAY)).toBe("1,5 dia");
  });
});

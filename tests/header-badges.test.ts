import { describe, expect, it } from "vitest";
import type { DevAlertDTO } from "@/app/_shared/lib/header-badges-types";
import {
  TEAM_BADGES_URL,
  mentionsIncrease,
  readHeaderBadges,
  unseenDevAlerts,
} from "@/app/_shared/utils/header-badges";

// Badges do cabeçalho da nova-dash (WhatsApp, Menções, Eventos e pop-up do
// dev) numa rota GET só, fora da fila serial de server actions. Resposta 2xx
// fora do formato LANÇA: o SWR guarda o erro e mantém os últimos números, em
// vez de zerar os badges.

const alert = (id: string, extra: Partial<DevAlertDTO> = {}): DevAlertDTO => ({
  id,
  title: null,
  message: `aviso ${id}`,
  authorName: "Dev",
  createdAt: "2026-09-26T12:00:00.000Z",
  ...extra,
});

describe("rota dos badges", () => {
  it("é rota da equipe, fora das allowlists do middleware", () => {
    expect(TEAM_BADGES_URL).toBe("/api/team/badges");
    for (const publico of ["/api/auth", "/api/whatsapp/webhook", "/api/whatsapp/cron", "/api/documents"]) {
      expect(TEAM_BADGES_URL.startsWith(publico)).toBe(false);
    }
  });
});

describe("readHeaderBadges", () => {
  it("devolve os 4 badges do corpo", () => {
    const body = { whatsappUnread: 12, mentionsPending: 3, devAlerts: [alert("a")], eventsSoon: 2 };
    expect(readHeaderBadges(body)).toEqual(body);
  });

  it("contagem estranha vira 0 (nunca NaN no badge) e fração é truncada", () => {
    const r = readHeaderBadges({ whatsappUnread: -1, mentionsPending: "3", devAlerts: [], eventsSoon: 2.7 });
    expect(r.whatsappUnread).toBe(0);
    expect(r.mentionsPending).toBe(0);
    expect(r.eventsSoon).toBe(2);
    expect(readHeaderBadges({ devAlerts: [], whatsappUnread: Number.NaN }).whatsappUnread).toBe(0);
  });

  it("descarta pop-up sem id ou sem texto e completa título/autor/data", () => {
    const r = readHeaderBadges({
      whatsappUnread: 0, mentionsPending: 0, eventsSoon: 0,
      devAlerts: [
        alert("ok"),
        { id: "", message: "sem id" },
        { id: "x" },
        null,
        "lixo",
        { id: "y", message: "mínimo", title: "  ", authorName: 5 },
      ],
    });
    expect(r.devAlerts.map((a) => a.id)).toEqual(["ok", "y"]);
    expect(r.devAlerts[1]).toEqual({
      id: "y", title: null, message: "mínimo", authorName: "Dev", createdAt: "1970-01-01T00:00:00.000Z",
    });
  });

  it.each([
    ["null", null],
    ["array cru", [1, 2]],
    ["sem devAlerts", { whatsappUnread: 1, mentionsPending: 0, eventsSoon: 0 }],
    ["devAlerts não-array", { devAlerts: "x" }],
    ["{ error } com 200", { error: "Falha ao carregar. Tente de novo." }],
  ])("formato errado (%s) lança", (_nome, body) => {
    expect(() => readHeaderBadges(body)).toThrow("Resposta inválida");
  });
});

describe("mentionsIncrease (toast + bolinha piscando)", () => {
  it("1ª leitura da tela não é novidade", () => {
    expect(mentionsIncrease(null, 0)).toBe(0);
    expect(mentionsIncrease(null, 7)).toBe(0);
  });

  it("subida = quantas chegaram", () => {
    expect(mentionsIncrease(2, 3)).toBe(1);
    expect(mentionsIncrease(0, 4)).toBe(4);
  });

  it("queda ou igual não pisca", () => {
    expect(mentionsIncrease(5, 5)).toBe(0);
    expect(mentionsIncrease(5, 2)).toBe(0);
    expect(mentionsIncrease(1, 0)).toBe(0);
  });

  it("valor inválido não avisa", () => {
    expect(mentionsIncrease(Number.NaN, 3)).toBe(0);
    expect(mentionsIncrease(1, Number.NaN)).toBe(0);
  });
});

describe("unseenDevAlerts", () => {
  it("tira os já fechados neste navegador e mantém a ordem", () => {
    const alerts = [alert("a"), alert("b"), alert("c")];
    expect(unseenDevAlerts(alerts, ["b"]).map((a) => a.id)).toEqual(["a", "c"]);
    expect(unseenDevAlerts(alerts, ["a", "b", "c"])).toEqual([]);
  });

  it("sem nada visto devolve uma cópia de todos", () => {
    const alerts = [alert("a")];
    const r = unseenDevAlerts(alerts, []);
    expect(r).toEqual(alerts);
    expect(r).not.toBe(alerts);
  });
});

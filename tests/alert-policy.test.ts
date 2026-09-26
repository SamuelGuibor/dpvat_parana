import { describe, expect, it } from "vitest";
import {
  QUALIFIED_PIN_MS,
  QUEUE_ALERT_STEPS_MS,
  isQualifiedLeadAlert,
  mergeBellNotifications,
  orderBellNotifications,
  ownerSectorRecipients,
  queueAlertAudience,
  queueWaitLabel,
  sameBrDay,
} from "@/app/_shared/utils/alert-policy";
import { WA_QUALIFIED_MARK } from "@/app/_shared/lib/whatsapp/close-categories";

// Avisos do WhatsApp no sino (EF-10/LAT-4): dono → setor → equipe → gestores,
// falha de entrega 1x por contato por dia BRT e LEAD QUALIFICADO no topo.

const HOUR = 60 * 60_000;

describe("queueAlertAudience", () => {
  it("com dono: 10 min só o dono, 1 h dono + setor, 4 h e 24 h a equipe", () => {
    expect(queueAlertAudience(1, true)).toBe("owner_or_sector");
    expect(queueAlertAudience(2, true)).toBe("owner_and_sector");
    expect(queueAlertAudience(3, true)).toBe("team");
    expect(queueAlertAudience(4, true)).toBe("team");
  });

  it("sem dono: 10 min o setor (owner_or_sector sem dono), 1 h a 24 h a equipe", () => {
    expect(queueAlertAudience(1, false)).toBe("owner_or_sector");
    expect(queueAlertAudience(2, false)).toBe("team");
    expect(queueAlertAudience(4, false)).toBe("team");
  });

  it("48 h vai só aos gestores, com ou sem dono", () => {
    expect(queueAlertAudience(5, false)).toBe("managers");
    expect(queueAlertAudience(5, true)).toBe("managers");
  });

  it("o último degrau é o de 48 h e é o dos gestores", () => {
    expect(QUEUE_ALERT_STEPS_MS).toEqual([10 * 60_000, HOUR, 4 * HOUR, 24 * HOUR, 48 * HOUR]);
    expect(queueAlertAudience(QUEUE_ALERT_STEPS_MS.length, true)).toBe("managers");
  });
});

describe("ownerSectorRecipients", () => {
  it("owner_or_sector com dono = só o dono", () => {
    expect(ownerSectorRecipients("owner_or_sector", "A", ["B", "C"])).toEqual(["A"]);
  });

  it("owner_or_sector sem dono = o setor", () => {
    expect(ownerSectorRecipients("owner_or_sector", null, ["B", "C"])).toEqual(["B", "C"]);
  });

  it("owner_and_sector = dono primeiro + setor, sem repetir quem é do setor", () => {
    expect(ownerSectorRecipients("owner_and_sector", "B", ["B", "C"])).toEqual(["B", "C"]);
    expect(ownerSectorRecipients("owner_and_sector", "A", ["B", "C"])).toEqual(["A", "B", "C"]);
    expect(ownerSectorRecipients("owner_and_sector", null, ["B"])).toEqual(["B"]);
  });
});

describe("sameBrDay", () => {
  it("02:59Z e 03:01Z de 11/09 são dias diferentes em Brasília (virada à meia-noite BRT)", () => {
    expect(sameBrDay(new Date("2026-09-11T02:59:00.000Z"), new Date("2026-09-11T03:01:00.000Z"))).toBe(false);
  });

  it("21h e 23h30 BRT de 10/09 (já 11/09 em UTC) são o mesmo dia", () => {
    expect(sameBrDay(new Date("2026-09-11T00:00:00.000Z"), new Date("2026-09-11T02:30:00.000Z"))).toBe(true);
  });

  it("nunca avisado (null) nunca é o mesmo dia", () => {
    expect(sameBrDay(null, new Date())).toBe(false);
    expect(sameBrDay(undefined, new Date())).toBe(false);
  });
});

describe("queueWaitLabel", () => {
  it("minutos até 2 h, depois horas", () => {
    expect(queueWaitLabel(10)).toBe("10 min");
    expect(queueWaitLabel(119)).toBe("119 min");
    expect(queueWaitLabel(245)).toBe("4 h");
    expect(queueWaitLabel(2880)).toBe("48 h");
  });
});

describe("sino: LEAD QUALIFICADO em destaque", () => {
  const now = Date.parse("2026-09-25T15:00:00.000Z");
  const at = (h: number) => new Date(now - h * HOUR).toISOString();
  const qualified = (id: string, h: number) => ({
    id,
    message: `WhatsApp: Ana — ${WA_QUALIFIED_MARK} — triagem aprovada pela IA`,
    createdAt: at(h),
  });
  const plain = (id: string, h: number) => ({ id, message: "WhatsApp: Bruno aguardando atendente", createdAt: at(h) });

  it("reconhece a marca", () => {
    expect(isQualifiedLeadAlert(qualified("q", 1).message)).toBe(true);
    expect(isQualifiedLeadAlert(plain("p", 1).message)).toBe(false);
    expect(isQualifiedLeadAlert(null)).toBe(false);
  });

  it("qualificado das últimas 24 h sobe para o topo, lido ou não; o resto por data", () => {
    const list = [plain("p1", 0.1), plain("p2", 2), qualified("q1", 5), plain("p3", 6), qualified("q2", 1)];
    expect(orderBellNotifications(list, now).map((n) => n.id)).toEqual(["q2", "q1", "p1", "p2", "p3"]);
  });

  it("qualificado com mais de 24 h volta para a ordem por data", () => {
    const old = qualified("q-old", QUALIFIED_PIN_MS / HOUR + 1);
    const list = [plain("p1", 1), old, plain("p2", 30)];
    expect(orderBellNotifications(list, now).map((n) => n.id)).toEqual(["p1", "q-old", "p2"]);
  });

  it("não muda a lista recebida", () => {
    const list = [plain("p1", 1), qualified("q1", 2)];
    orderBellNotifications(list, now);
    expect(list.map((n) => n.id)).toEqual(["p1", "q1"]);
  });

  it("merge das 50 mais novas com os qualificados de 24 h: sem repetir, mais nova primeiro", () => {
    const latest = [plain("p1", 1), qualified("q1", 2)];
    const extra = [qualified("q1", 2), qualified("q0", 20)];
    expect(mergeBellNotifications(latest, extra).map((n) => n.id)).toEqual(["p1", "q1", "q0"]);
  });
});

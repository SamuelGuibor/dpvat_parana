import { describe, expect, it } from "vitest";
import {
  buildBusinessMessagingEvent,
  eventsWereReceived,
  META_PURCHASE_VALUE_BRL,
  sha256,
} from "@/app/_shared/utils/meta-capi-payload";

const base = {
  contactId: "c1",
  wabaId: "1578951027140630",
  ctwaClid: "ARAkLkA8rmlFeiCktEJQ-QTwRiyYHAFDLMNDBH0CD3qpjd0HR4irJ6LEkR7JwFF4XvnO2E4Nx0-eM-GABDLOPaOdRMv-_zfUQ2a",
  phone: "41 98765-4321",
  occurredAt: new Date("2026-10-13T15:00:00.000Z"),
};

describe("buildBusinessMessagingEvent", () => {
  it("Purchase: formato de mensagens comerciais com valor e event_id fixo", () => {
    const ev = buildBusinessMessagingEvent({ ...base, eventName: "Purchase" });
    expect(ev).toEqual({
      event_name: "Purchase",
      event_time: 1791903600,
      event_id: "c1-purchase",
      action_source: "business_messaging",
      messaging_channel: "whatsapp",
      user_data: {
        whatsapp_business_account_id: "1578951027140630",
        ctwa_clid: base.ctwaClid,
        ph: [sha256("5541987654321")],
      },
      custom_data: { value: META_PURCHASE_VALUE_BRL, currency: "BRL" },
    });
    expect(META_PURCHASE_VALUE_BRL).toBe(1500);
  });

  it("LeadSubmitted: sem custom_data, event_id -lead, nunca page_id", () => {
    const ev = buildBusinessMessagingEvent({ ...base, eventName: "LeadSubmitted" });
    expect(ev.event_id).toBe("c1-lead");
    expect(ev).not.toHaveProperty("custom_data");
    expect(ev.user_data).not.toHaveProperty("page_id");
  });

  it("event_time em segundos, não milissegundos", () => {
    const ev = buildBusinessMessagingEvent({ ...base, eventName: "LeadSubmitted" });
    expect(String(ev.event_time)).toHaveLength(10);
  });

  it("ctwa_clid vai sem alteração e telefone inválido some", () => {
    const ev = buildBusinessMessagingEvent({ ...base, phone: "123", eventName: "LeadSubmitted" });
    expect((ev.user_data as Record<string, unknown>).ctwa_clid).toBe(base.ctwaClid);
    expect(ev.user_data).not.toHaveProperty("ph");
  });
});

describe("eventsWereReceived", () => {
  it("só aceita events_received ≥ 1", () => {
    expect(eventsWereReceived({ events_received: 1, fbtrace_id: "x" })).toBe(true);
    expect(eventsWereReceived({ events_received: 0 })).toBe(false);
    expect(eventsWereReceived({ error: { message: "Invalid parameter" } })).toBe(false);
    expect(eventsWereReceived(null)).toBe(false);
  });
});

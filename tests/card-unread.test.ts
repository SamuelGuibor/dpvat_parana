import { describe, expect, it } from "vitest";
import { groupCardUnread, readCardUnread } from "@/app/_shared/utils/card-unread";

// T-AJ2PT: selo de mensagem não lida no card.
describe("groupCardUnread", () => {
  it("separa User e Process e fica com o contato de mensagem mais recente", () => {
    const r = groupCardUnread([
      { userId: "u1", processId: null, contactId: "c-antigo", at: new Date("2026-11-09T10:00:00Z") },
      { userId: "u1", processId: null, contactId: "c-novo", at: new Date("2026-11-09T12:00:00Z") },
      { userId: "u2", processId: "p1", contactId: "c-proc", at: null },
    ]);
    expect(r.users.u1).toEqual({ contactId: "c-novo", at: "2026-11-09T12:00:00.000Z" });
    expect(r.processes.p1).toEqual({ contactId: "c-proc", at: null });
    expect(r.users.u2).toBeUndefined();
  });
});

describe("readCardUnread", () => {
  it("lixo vira mapa vazio; entrada sem contactId cai", () => {
    expect(readCardUnread(null)).toEqual({ users: {}, processes: {} });
    expect(readCardUnread({ users: { a: { at: "x" }, b: { contactId: "c", at: 1 } }, processes: [] })).toEqual({
      users: { b: { contactId: "c", at: null } },
      processes: {},
    });
  });
});

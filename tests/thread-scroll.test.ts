import { describe, expect, it } from "vitest";
import type { WhatsAppThreadMessage } from "@/app/_shared/hooks/use-whatsapp";
import {
  NEAR_BOTTOM_PX,
  countNewBelow,
  decideThreadScroll,
  isOwnThreadMessage,
  tailAdvanced,
  threadTail,
  type ThreadScrollInput,
} from "@/app/_shared/utils/thread-scroll";

// Auto-scroll da thread do inbox (auditoria de 24/09/2026, MISSED thread): a
// mensagem nova do cliente não aparecia em conversa com mais de 50 mensagens,
// porque o efeito só olhava o total (que não muda com a janela cheia).

const BASE = Date.parse("2026-09-20T12:00:00.000Z");

function m(id: string, sec: number, extra: Partial<WhatsAppThreadMessage> = {}): WhatsAppThreadMessage {
  return {
    id,
    contactId: "c1",
    direction: "in",
    body: id,
    mediaKey: null,
    mediaType: null,
    status: "delivered",
    sentByBot: false,
    authorId: null,
    authorName: null,
    internal: false,
    createdAt: new Date(BASE + sec * 1000).toISOString(),
    ...extra,
  };
}

/** Nova mensagem do cliente, sem troca de conversa nem prepend, a `distance` px do fim. */
function input(over: Partial<ThreadScrollInput> = {}): ThreadScrollInput {
  return {
    contactChanged: false,
    prependPending: false,
    lastIdChanged: true,
    distanceFromBottom: 0,
    lastIsMine: false,
    ...over,
  };
}

describe("decideThreadScroll", () => {
  it("contato trocado → jump (mesmo com âncora de prepend ou mensagem nova)", () => {
    expect(decideThreadScroll(input({ contactChanged: true }))).toBe("jump");
    expect(decideThreadScroll(input({ contactChanged: true, prependPending: true, distanceFromBottom: 900 }))).toBe("jump");
  });

  it("prepend → restore (tem prioridade sobre mensagem nova)", () => {
    expect(decideThreadScroll(input({ prependPending: true, lastIdChanged: false }))).toBe("restore");
    expect(decideThreadScroll(input({ prependPending: true, lastIsMine: true }))).toBe("restore");
  });

  it("nova mensagem com 400px do fim → chip", () => {
    expect(decideThreadScroll(input({ distanceFromBottom: 400 }))).toBe("chip");
  });

  it("nova mensagem perto do fim → smooth", () => {
    expect(decideThreadScroll(input({ distanceFromBottom: 0 }))).toBe("smooth");
    expect(decideThreadScroll(input({ distanceFromBottom: NEAR_BOTTOM_PX - 1 }))).toBe("smooth");
    expect(decideThreadScroll(input({ distanceFromBottom: NEAR_BOTTOM_PX }))).toBe("chip");
  });

  it("nova mensagem minha longe do fim → smooth", () => {
    expect(decideThreadScroll(input({ distanceFromBottom: 5000, lastIsMine: true }))).toBe("smooth");
  });

  it("mesma última id → none", () => {
    expect(decideThreadScroll(input({ lastIdChanged: false, distanceFromBottom: 0 }))).toBe("none");
    expect(decideThreadScroll(input({ lastIdChanged: false, distanceFromBottom: 400 }))).toBe("none");
  });
});

describe("tailAdvanced", () => {
  it("janela de 50 cheia desliza (R0..R49 → R1..R49,N): o total não muda, mas a última sim", () => {
    const before = Array.from({ length: 50 }, (_, i) => m(`R${i}`, i));
    const after = [...before.slice(1), m("N", 60)];
    expect(after.length).toBe(before.length);
    expect(tailAdvanced(threadTail(before), threadTail(after))).toBe(true);
  });

  it("mesma última (poll de ticks/reação) → false", () => {
    const list = [m("A", 1), m("B", 2)];
    const polled = [m("A", 1), m("B", 2, { status: "read" })];
    expect(tailAdvanced(threadTail(list), threadTail(polled))).toBe(false);
  });

  it("última descartada/apagada deixa uma anterior no fim → false", () => {
    const withFailed = [m("A", 1), m("temp-x", 5, { status: "failed", direction: "out" })];
    const discarded = [m("A", 1)];
    expect(tailAdvanced(threadTail(withFailed), threadTail(discarded))).toBe(false);
  });

  it("thread vazia que recebe a 1ª mensagem → true; ficar vazia → false", () => {
    expect(tailAdvanced(null, threadTail([m("A", 1)]))).toBe(true);
    expect(tailAdvanced(threadTail([m("A", 1)]), null)).toBe(false);
    expect(threadTail([])).toBeNull();
  });
});

describe("isOwnThreadMessage", () => {
  it("bolha otimista e mensagem gravada com o meu id são minhas", () => {
    expect(isOwnThreadMessage(m("temp-1", 1, { direction: "out", authorId: "me" }), "me")).toBe(true);
    expect(isOwnThreadMessage(m("temp-2", 1, { direction: "out", status: "failed" }), "")).toBe(true);
    expect(isOwnThreadMessage(m("X", 1, { direction: "out", authorId: "me" }), "me")).toBe(true);
  });

  it("cliente, bot e outro atendente não são; sem sessão, nada gravado é meu", () => {
    expect(isOwnThreadMessage(m("A", 1), "me")).toBe(false);
    expect(isOwnThreadMessage(m("B", 1, { direction: "out", sentByBot: true }), "me")).toBe(false);
    expect(isOwnThreadMessage(m("C", 1, { direction: "out", authorId: "outro" }), "me")).toBe(false);
    expect(isOwnThreadMessage(m("D", 1, { direction: "out", authorId: null }), "")).toBe(false);
  });
});

describe("countNewBelow", () => {
  const list = [m("A", 1), m("B", 2), m("C", 3), m("D", 4)];

  it("conta as mensagens depois da antiga última (poll trouxe várias)", () => {
    expect(countNewBelow(list, "B")).toBe(2);
    expect(countNewBelow(list, "C")).toBe(1);
  });

  it("antiga última fora da lista (bolha otimista virou real) ou ausente → 1", () => {
    expect(countNewBelow(list, "temp-x")).toBe(1);
    expect(countNewBelow(list, null)).toBe(1);
  });
});

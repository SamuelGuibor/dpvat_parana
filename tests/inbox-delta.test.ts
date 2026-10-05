import { describe, expect, it } from "vitest";
import {
  DELTA_MAX_AGE_MS,
  DELTA_OVERLAP_MS,
  INBOX_GROUP_CAPS,
  LOCAL_EDIT_TTL_MS,
  inboxListGroup,
  lockedConversationIds,
  mergeConversationDelta,
  parseDeltaSince,
  pruneLocalEdits,
  sinceWithOverlap,
  trimInboxList,
  type LocalEdit,
} from "@/app/_shared/utils/inbox-delta";

// Sincronização da lista do inbox por delta (auditoria de 24/09/2026, B3): a
// lista inteira (~1,3 MB) só vem na montagem e a cada 10 min; o poll de 15 s
// traz só as conversas que mudaram, fundidas por id na lista em memória.

type Row = { id: string; contactId: string; lastMessageAt: string; status: string; tags: string[] };

const at = (min: number) => new Date(Date.UTC(2026, 8, 26, 12, min)).toISOString();
const row = (id: string, min: number, extra: Partial<Row> = {}): Row => ({
  id, contactId: `c-${id}`, lastMessageAt: at(min), status: "bot", tags: [], ...extra,
});
const ids = (list: Row[]) => list.map((r) => r.id);

describe("mergeConversationDelta", () => {
  const base = [row("a", 50), row("b", 40), row("c", 30)];

  it("item existente é substituído pela linha do servidor", () => {
    const upd = row("b", 40, { tags: ["Contratados"] });
    const out = mergeConversationDelta(base, [upd], { cap: 1000 });
    expect(ids(out)).toEqual(["a", "b", "c"]);
    expect(out[1]).toBe(upd);
    expect(base[1].tags).toEqual([]); // não muta a entrada
  });

  it("item novo entra na posição certa por lastMessageAt desc", () => {
    expect(ids(mergeConversationDelta(base, [row("n", 45)], { cap: 1000 }))).toEqual(["a", "n", "b", "c"]);
    expect(ids(mergeConversationDelta(base, [row("n", 59)], { cap: 1000 }))).toEqual(["n", "a", "b", "c"]);
    expect(ids(mergeConversationDelta(base, [row("n", 1)], { cap: 1000 }))).toEqual(["a", "b", "c", "n"]);
  });

  it("mensagem nova sobe a conversa para o topo", () => {
    expect(ids(mergeConversationDelta(base, [row("c", 55)], { cap: 1000 }))).toEqual(["c", "a", "b"]);
  });

  it("empate de lastMessageAt: a que acabou de chegar fica na frente (igual ao patch local)", () => {
    expect(ids(mergeConversationDelta(base, [row("n", 40)], { cap: 1000 }))).toEqual(["a", "n", "b", "c"]);
  });

  it("corta em cap (a lista continua sendo 'as N mais recentes')", () => {
    const out = mergeConversationDelta(base, [row("n", 59), row("m", 58)], { cap: 3 });
    expect(ids(out)).toEqual(["n", "m", "a"]);
    // conversa velha que mudou (tag numa conversa fora do topo) não entra na lista cheia
    expect(ids(mergeConversationDelta(base, [row("old", 1)], { cap: 3 }))).toEqual(["a", "b", "c"]);
  });

  it("duplicata do overlap é idempotente", () => {
    const delta = [row("b", 57, { status: "human" }), row("n", 45)];
    const once = mergeConversationDelta(base, delta, { cap: 1000 });
    const twice = mergeConversationDelta(once, delta, { cap: 1000 });
    expect(ids(twice)).toEqual(ids(once));
    expect(twice).toEqual(once);
    // o servidor repetindo o mesmo id na resposta: vale o último
    const dup = mergeConversationDelta(base, [row("b", 40, { status: "queued" }), row("b", 40, { status: "human" })], { cap: 1000 });
    expect(dup.filter((r) => r.id === "b")).toHaveLength(1);
    expect(dup.find((r) => r.id === "b")?.status).toBe("human");
  });

  it("id em lockedIds não é sobrescrito (patch otimista mais novo que o pedido)", () => {
    const optimistic = row("b", 40, { tags: ["Urgente"] });
    const current = [base[0], optimistic, base[2]];
    const out = mergeConversationDelta(current, [row("b", 40, { tags: [] }), row("n", 45)], {
      cap: 1000, lockedIds: new Set(["b"]),
    });
    expect(out.find((r) => r.id === "b")).toBe(optimistic);
    expect(ids(out)).toEqual(["a", "n", "b", "c"]);
  });

  it("mudança para status 'closed' é aplicada (a conversa muda de pasta sozinha)", () => {
    const out = mergeConversationDelta(base, [row("a", 50, { status: "closed" })], { cap: 1000 });
    expect(out.find((r) => r.id === "a")?.status).toBe("closed");
  });

  it("nada a aplicar devolve a MESMA referência (sem re-render)", () => {
    expect(mergeConversationDelta(base, [], { cap: 1000 })).toBe(base);
    expect(mergeConversationDelta(base, [row("b", 40)], { cap: 1000, lockedIds: new Set(["b"]) })).toBe(base);
  });

  it("insertNew:false só substitui quem já está (busca e conversa aberta fora do topo)", () => {
    const search = [row("x", 10), row("y", 5)];
    const out = mergeConversationDelta(search, [row("y", 5, { tags: ["Contratados"] }), row("n", 59)], {
      cap: search.length, insertNew: false,
    });
    expect(ids(out)).toEqual(["x", "y"]);
    expect(out[1].tags).toEqual(["Contratados"]);
    expect(mergeConversationDelta(search, [row("n", 59)], { cap: 2, insertNew: false })).toBe(search);
    // a conversa hidratada (uma só)
    const single = [row("x", 10)];
    expect(mergeConversationDelta(single, [row("x", 10, { status: "closed" })], { cap: 1, insertNew: false })[0].status)
      .toBe("closed");
  });

  it("lastMessageAt inválido vai para o fim em vez de quebrar a ordem", () => {
    const out = mergeConversationDelta(base, [{ ...row("z", 0), lastMessageAt: "lixo" }], { cap: 1000 });
    expect(ids(out)).toEqual(["a", "b", "c", "z"]);
  });
});

// Tetos por grupo (05/10/2026): o corte único nas 1.000 mais recentes tirava
// da pasta conversa parada na Fila/standby há mais de ~2 semanas.
describe("trimInboxList (tetos por grupo de status)", () => {
  // n linhas de um status, da mais recente para a mais antiga.
  const many = (prefix: string, n: number, status: string) =>
    Array.from({ length: n }, (_, i) => row(`${prefix}${i}`, 0, {
      status, lastMessageAt: new Date(Date.UTC(2026, 8, 26) - i * 60_000).toISOString(),
    }));

  it("grupos: closed, standby e o resto (inclusive status desconhecido) como aberta", () => {
    expect(inboxListGroup("closed")).toBe("closed");
    expect(inboxListGroup("standby")).toBe("standby");
    for (const s of ["bot", "queued", "human", "outro"]) expect(inboxListGroup(s)).toBe("open");
  });

  it("abaixo dos tetos devolve a mesma referência", () => {
    const list = [row("a", 50), row("b", 40, { status: "closed" })];
    expect(trimInboxList(list)).toBe(list);
  });

  it("conversa aberta antiga sobrevive a mil encerradas mais novas", () => {
    const closed = many("x", INBOX_GROUP_CAPS.closed + 5, "closed");
    const queuedOld = row("fila", 0, { status: "queued", lastMessageAt: "2026-01-01T00:00:00.000Z" });
    const out = trimInboxList([...closed, queuedOld]);
    expect(out.filter((r) => r.status === "closed")).toHaveLength(INBOX_GROUP_CAPS.closed);
    expect(out.at(-1)?.id).toBe("fila");
    // Cortou as encerradas MAIS ANTIGAS.
    expect(out.some((r) => r.id === `x${INBOX_GROUP_CAPS.closed}`)).toBe(false);
  });

  it("standby tem teto próprio", () => {
    const out = trimInboxList(many("s", INBOX_GROUP_CAPS.standby + 3, "standby"));
    expect(out).toHaveLength(INBOX_GROUP_CAPS.standby);
  });

  it("merge com cap em função: conversa nova não empurra a aberta antiga para fora", () => {
    const closed = many("x", INBOX_GROUP_CAPS.closed, "closed");
    const queuedOld = row("fila", 0, { status: "queued", lastMessageAt: "2026-01-01T00:00:00.000Z" });
    const out = mergeConversationDelta([...closed, queuedOld], [row("n", 59, { status: "closed" })], { cap: trimInboxList });
    expect(out[0].id).toBe("n");
    expect(out.some((r) => r.id === "fila")).toBe(true);
    expect(out.filter((r) => r.status === "closed")).toHaveLength(INBOX_GROUP_CAPS.closed);
  });
});

describe("sinceWithOverlap", () => {
  it("subtrai 5 s e aceita ISO", () => {
    expect(DELTA_OVERLAP_MS).toBe(5_000);
    expect(sinceWithOverlap("2026-09-26T12:00:00.000Z")).toBe("2026-09-26T11:59:55.000Z");
    expect(sinceWithOverlap("2026-09-26T12:00:00Z")).toBe("2026-09-26T11:59:55.000Z");
    expect(sinceWithOverlap("2026-09-26T09:00:00.123-03:00")).toBe("2026-09-26T11:59:55.123Z");
  });

  it("aceita outra margem (e ignora margem negativa)", () => {
    expect(sinceWithOverlap("2026-09-26T12:00:00.000Z", 10_000)).toBe("2026-09-26T11:59:50.000Z");
    expect(sinceWithOverlap("2026-09-26T12:00:00.000Z", -1)).toBe("2026-09-26T12:00:00.000Z");
  });

  it("cursor inválido lança", () => {
    expect(() => sinceWithOverlap("ontem")).toThrow(RangeError);
    expect(() => sinceWithOverlap("")).toThrow(RangeError);
  });
});

describe("parseDeltaSince (validação do ?since= na rota)", () => {
  const now = Date.parse("2026-09-26T12:00:00.000Z");

  it("ISO recente vira Date", () => {
    expect(parseDeltaSince("2026-09-26T11:59:40.000Z", now)?.toISOString()).toBe("2026-09-26T11:59:40.000Z");
  });

  it("ausente, inválido, mais velho que 24 h ou no futuro → null (lista inteira)", () => {
    expect(parseDeltaSince(null, now)).toBeNull();
    expect(parseDeltaSince("", now)).toBeNull();
    expect(parseDeltaSince("abc", now)).toBeNull();
    expect(parseDeltaSince(new Date(now - DELTA_MAX_AGE_MS - 1).toISOString(), now)).toBeNull();
    expect(parseDeltaSince(new Date(now + 5 * 60_000).toISOString(), now)).toBeNull();
  });

  it("24 h exatas e relógio um pouco adiantado ainda valem", () => {
    expect(parseDeltaSince(new Date(now - DELTA_MAX_AGE_MS).toISOString(), now)).not.toBeNull();
    expect(parseDeltaSince(new Date(now + 30_000).toISOString(), now)).not.toBeNull();
  });
});

describe("travas do delta (patch otimista e ação em voo)", () => {
  const incoming = [row("a", 50), row("b", 40), row("c", 30)];

  it("trava quem teve patch depois do início do pedido ou tem ação em voo", () => {
    const edits = new Map<string, LocalEdit>([
      ["c-a", { at: 1_000, pending: 0 }], // patch antes do pedido: não trava
      ["c-b", { at: 2_500, pending: 0 }], // patch depois: trava
      ["c-c", { at: 500, pending: 1 }], // ação em voo: trava
    ]);
    expect([...lockedConversationIds(incoming, edits, 2_000)].sort()).toEqual(["b", "c"]);
  });

  it("sem edição nenhuma, nada trava", () => {
    expect(lockedConversationIds(incoming, new Map(), 2_000).size).toBe(0);
  });

  it("pruneLocalEdits tira só o que já não trava nada", () => {
    const edits = new Map<string, LocalEdit>([
      ["velha", { at: 0, pending: 0 }],
      ["velha-em-voo", { at: 0, pending: 2 }],
      ["recente", { at: LOCAL_EDIT_TTL_MS, pending: 0 }],
    ]);
    pruneLocalEdits(edits, LOCAL_EDIT_TTL_MS + 1);
    expect([...edits.keys()].sort()).toEqual(["recente", "velha-em-voo"]);
  });
});

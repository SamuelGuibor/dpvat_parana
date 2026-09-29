import { describe, expect, it } from "vitest";
import { createTtlCache } from "@/app/_shared/utils/ttl-cache";

// Cache por instância do setor do autor (log.ts) e dos destinatários do relay
// (service.ts): relógio injetado para testar o prazo sem esperar.

function clock(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe("createTtlCache", () => {
  it("devolve o valor dentro do prazo e expira ao completar o TTL", () => {
    const c = clock();
    const cache = createTtlCache<string, number>({ ttlMs: 100, now: c.now });
    cache.set("a", 1);
    c.advance(99);
    expect(cache.get("a")).toBe(1);
    c.advance(1);
    expect(cache.get("a")).toBeUndefined();
  });

  it("chave ausente volta undefined", () => {
    const cache = createTtlCache<string, number>({ ttlMs: 100 });
    expect(cache.get("nada")).toBeUndefined();
  });

  it("guarda e devolve null (cache negativo), diferente de ausente", () => {
    const c = clock();
    const cache = createTtlCache<string, { x: number } | null>({ ttlMs: 100, now: c.now });
    cache.set("sem-setor", null);
    expect(cache.get("sem-setor")).toBeNull();
    c.advance(100);
    expect(cache.get("sem-setor")).toBeUndefined();
  });

  it("regravar renova o prazo", () => {
    const c = clock();
    const cache = createTtlCache<string, number>({ ttlMs: 100, now: c.now });
    cache.set("a", 1);
    c.advance(80);
    cache.set("a", 2);
    c.advance(80);
    expect(cache.get("a")).toBe(2);
  });

  it("delete remove uma chave e clear remove todas", () => {
    const cache = createTtlCache<string, number>({ ttlMs: 1_000 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("c", 3);
    cache.delete("a");
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("b")).toBe(2);
    cache.clear();
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("c")).toBeUndefined();
  });

  it("acima do teto de chaves despeja a mais antiga", () => {
    const cache = createTtlCache<string, number>({ ttlMs: 1_000, maxEntries: 2 });
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 11); // regravar move "a" para o fim: a mais antiga passa a ser "b"
    cache.set("c", 3);
    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(11);
    expect(cache.get("c")).toBe(3);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCoalescer, createSingleFlight } from "@/app/_shared/utils/refresh-gate";

// Portões da recarga da lista do inbox: o mutate() do SWR não deduplica, então
// quem pede recarga passa por aqui (auditoria de 24/09/2026).

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

/** Promise controlada por fora, para simular a carga "em voo". */
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSingleFlight", () => {
  it("3 pedidos durante uma execução geram 2 execuções no total (a em voo + 1)", async () => {
    const runs: Deferred<number>[] = [];
    const run = vi.fn(() => {
      const d = deferred<number>();
      runs.push(d);
      return d.promise;
    });
    const gate = createSingleFlight(run);

    const first = gate.trigger();
    const a = gate.trigger();
    const b = gate.trigger();
    const c = gate.trigger();
    expect(run).toHaveBeenCalledTimes(1);
    // Os 3 pedidos durante o voo compartilham a MESMA execução extra.
    expect(a).toBe(b);
    expect(b).toBe(c);

    runs[0].resolve(1);
    await expect(first).resolves.toBe(1);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));

    runs[1].resolve(2);
    await expect(a).resolves.toBe(2);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("quem chama durante o voo só resolve depois da 2ª execução", async () => {
    const runs: Deferred<string>[] = [];
    const gate = createSingleFlight(() => {
      const d = deferred<string>();
      runs.push(d);
      return d.promise;
    });

    void gate.trigger();
    let settled = false;
    const late = gate.trigger().then((v) => {
      settled = true;
      return v;
    });

    runs[0].resolve("carga velha");
    await vi.waitFor(() => expect(runs).toHaveLength(2));
    // A 1ª terminou, mas quem pediu durante o voo ainda espera a extra.
    expect(settled).toBe(false);

    runs[1].resolve("carga nova");
    await expect(late).resolves.toBe("carga nova");
  });

  it("depois que tudo termina, o próximo pedido começa uma execução nova", async () => {
    const run = vi.fn(async () => "ok");
    const gate = createSingleFlight(run);
    await gate.trigger();
    await gate.trigger();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("falha na execução em voo não impede a extra", async () => {
    const runs: Deferred<string>[] = [];
    const gate = createSingleFlight(() => {
      const d = deferred<string>();
      runs.push(d);
      return d.promise;
    });
    const first = gate.trigger();
    const extra = gate.trigger();
    runs[0].reject(new Error("rede"));
    await expect(first).rejects.toThrow("rede");
    await vi.waitFor(() => expect(runs).toHaveLength(2));
    runs[1].resolve("ok");
    await expect(extra).resolves.toBe("ok");
  });
});

describe("createCoalescer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("5 pedidos em 1s geram 1 execução depois de delayMs", () => {
    const run = vi.fn();
    const c = createCoalescer({ delayMs: 2000, run });
    for (let i = 0; i < 5; i++) {
      c.trigger();
      vi.advanceTimersByTime(200);
    }
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000); // 2000 ms desde o 1º pedido
    expect(run).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("aba oculta: trigger não roda; flushIfDirty roda uma vez e limpa o sujo", () => {
    let hidden = true;
    const run = vi.fn();
    const c = createCoalescer({ delayMs: 2000, isHidden: () => hidden, run });

    c.trigger();
    c.trigger();
    c.trigger();
    vi.advanceTimersByTime(10_000);
    expect(run).not.toHaveBeenCalled();

    hidden = false;
    c.flushIfDirty();
    vi.advanceTimersByTime(2000);
    expect(run).toHaveBeenCalledTimes(1);

    // Segundo flush sem pedido novo: nada.
    c.flushIfDirty();
    vi.advanceTimersByTime(10_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("flushIfDirty sem pedido pendente não faz nada", () => {
    const run = vi.fn();
    const c = createCoalescer({ delayMs: 500, isHidden: () => false, run });
    c.flushIfDirty();
    vi.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();
  });

  it("aba ficou oculta durante a espera: não roda escondida, fica para a volta", () => {
    let hidden = false;
    const run = vi.fn();
    const c = createCoalescer({ delayMs: 2000, isHidden: () => hidden, run });
    c.trigger();
    hidden = true;
    vi.advanceTimersByTime(2000);
    expect(run).not.toHaveBeenCalled();
    hidden = false;
    c.flushIfDirty();
    vi.advanceTimersByTime(2000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("dispose cancela o timer pendente e ignora pedidos futuros", () => {
    const run = vi.fn();
    const c = createCoalescer({ delayMs: 1000, run });
    c.trigger();
    c.dispose();
    vi.advanceTimersByTime(5000);
    c.trigger();
    c.flushIfDirty();
    vi.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();
  });

  it("rejeição do run não escapa (ninguém espera a recarga coalescida)", async () => {
    const c = createCoalescer({ delayMs: 100, run: () => Promise.reject(new Error("falhou")) });
    c.trigger();
    vi.advanceTimersByTime(100);
    // Se a rejeição escapasse, o vitest acusaria "unhandled rejection".
    await Promise.resolve();
  });
});

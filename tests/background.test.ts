import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// runAfterResponse: trabalho depois da resposta (relay, logs sem IA, tique
// azul) com o waitUntil oficial da Vercel. Aqui o waitUntil é espião — o que
// importa é que ele recebe a promise e que nada disso quebra o chamador.
const { waitUntil } = vi.hoisted(() => ({ waitUntil: vi.fn() }));
vi.mock("@vercel/functions", () => ({ waitUntil }));

import { runAfterResponse } from "@/app/_shared/lib/background";

describe("runAfterResponse", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    waitUntil.mockReset();
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("dispara a task na hora e entrega uma promise ao waitUntil", async () => {
    const task = vi.fn(async () => "ok");
    runAfterResponse("teste", task);
    expect(task).toHaveBeenCalledTimes(1);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    const given = waitUntil.mock.calls[0][0];
    expect(given).toBeInstanceOf(Promise);
    await expect(given).resolves.toBe("ok");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("rejeição da task vira console.error com o rótulo e não propaga", async () => {
    const boom = new Error("relay fora");
    runAfterResponse("relay", () => Promise.reject(boom));
    const given = waitUntil.mock.calls[0][0] as Promise<unknown>;
    await expect(given).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith("[BG] relay", boom);
  });

  it("task que lança de forma síncrona não quebra o chamador", async () => {
    const boom = new Error("síncrono");
    expect(() =>
      runAfterResponse("log wa_text", () => {
        throw boom;
      }),
    ).not.toThrow();
    const given = waitUntil.mock.calls[0][0] as Promise<unknown>;
    await expect(given).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalledWith("[BG] log wa_text", boom);
  });

  it("waitUntil que lança (sem contexto) não quebra o chamador e a task roda", async () => {
    waitUntil.mockImplementation(() => {
      throw new Error("sem contexto");
    });
    const task = vi.fn(async () => undefined);
    expect(() => runAfterResponse("tique azul", task)).not.toThrow();
    expect(task).toHaveBeenCalledTimes(1);
  });
});

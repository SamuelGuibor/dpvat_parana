import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// reportCriticalError grava o erro engolido como Log "critical_error" (com o
// contactId quando há contato), porque o console da Vercel é efêmero e as
// conversas órfãs do bot ficavam sem causa investigável. Nunca lança, e o mesmo
// erro repetido não vira uma linha por evento. Sem banco: createLog mockado.

const mocks = vi.hoisted(() => ({ createLog: vi.fn() }));
vi.mock("@/app/_shared/lib/log", () => ({ createLog: mocks.createLog }));

import { reportCriticalError } from "@/app/_shared/lib/report-error";
import { criticalErrorKey, describeError } from "@/app/_shared/utils/critical-error";

beforeEach(() => {
  mocks.createLog.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("describeError", () => {
  it("Error: nome, mensagem e só as linhas 'at' da pilha", () => {
    const err = new TypeError("quebrou");
    err.stack = "TypeError: quebrou\n    at a (x.ts:1:1)\n    at b (y.ts:2:2)";
    expect(describeError(err)).toEqual({
      name: "TypeError",
      message: "quebrou",
      stack: "at a (x.ts:1:1)\nat b (y.ts:2:2)",
    });
  });

  it("pilha longa fica nos 8 primeiros quadros", () => {
    const err = new Error("x");
    err.stack = ["Error: x", ...Array.from({ length: 20 }, (_, i) => `    at f${i} (z.ts:${i}:1)`)].join("\n");
    expect(describeError(err).stack?.split("\n")).toHaveLength(8);
  });

  it("mensagem enorme (erro do Prisma com a chamada inteira) é cortada", () => {
    const info = describeError(new Error("a".repeat(5000)));
    expect(info.message.length).toBeLessThanOrEqual(501);
    expect(info.message.endsWith("…")).toBe(true);
  });

  it("string, objeto e objeto circular viram texto sem lançar", () => {
    expect(describeError("falhou")).toEqual({ name: "string", message: "falhou" });
    expect(describeError({ code: 42 })).toEqual({ name: "object", message: '{"code":42}' });
    const circ: Record<string, unknown> = {};
    circ.self = circ;
    expect(describeError(circ).message).toBe("[object Object]");
    expect(describeError(undefined)).toEqual({ name: "undefined", message: "undefined" });
  });

  it("timeout do fetch (DOMException) é tratado como Error", () => {
    const info = describeError(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    expect(info.name).toBe("TimeoutError");
    expect(info.message).toContain("timeout");
  });
});

describe("criticalErrorKey", () => {
  it("mesmo contexto, contato e mensagem = mesma chave; contato diferente = outra", () => {
    expect(criticalErrorKey("BOT", "x", "c1")).toBe(criticalErrorKey("BOT", "x", "c1"));
    expect(criticalErrorKey("BOT", "x", "c1")).not.toBe(criticalErrorKey("BOT", "x", "c2"));
    expect(criticalErrorKey("BOT", "x", null)).toBe(criticalErrorKey("BOT", "x"));
  });
});

describe("reportCriticalError", () => {
  it("grava Log critical_error com contexto, erro e o contato", async () => {
    await reportCriticalError("TESTE contato", new Error("banco fora"), {
      contactId: "c1",
      metadata: { botError: "timeout" },
    });

    expect(mocks.createLog).toHaveBeenCalledTimes(1);
    const input = mocks.createLog.mock.calls[0][0];
    expect(input).toMatchObject({
      action: "critical_error",
      message: "TESTE contato: banco fora",
      authorId: "system",
      authorName: "Sistema",
    });
    expect(input.metadata).toMatchObject({
      context: "TESTE contato",
      error: "banco fora",
      errorName: "Error",
      channel: "whatsapp",
      contactId: "c1",
      botError: "timeout",
    });
    expect(console.error).toHaveBeenCalled();
  });

  it("sem contato: sem channel/contactId no metadata", async () => {
    await reportCriticalError("TESTE sem contato", new Error("x"));
    const { metadata } = mocks.createLog.mock.calls[0][0];
    expect(metadata.contactId).toBeUndefined();
    expect(metadata.channel).toBeUndefined();
  });

  it("o metadata extra não sobrescreve os campos do erro", async () => {
    await reportCriticalError("TESTE extra", new Error("real"), { metadata: { error: "falso", context: "falso" } });
    const { metadata } = mocks.createLog.mock.calls[0][0];
    expect(metadata.error).toBe("real");
    expect(metadata.context).toBe("TESTE extra");
  });

  it("o mesmo erro repetido dentro da janela é gravado uma vez só (o console sempre loga)", async () => {
    await reportCriticalError("TESTE repetido", new Error("igual"), { contactId: "c9" });
    await reportCriticalError("TESTE repetido", new Error("igual"), { contactId: "c9" });
    await reportCriticalError("TESTE repetido", new Error("igual"), { contactId: "c10" });

    expect(mocks.createLog).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledTimes(3);
  });

  it("nunca lança, mesmo se o registro falhar", async () => {
    mocks.createLog.mockRejectedValue(new Error("sem banco"));
    await expect(reportCriticalError("TESTE falha do log", new Error("x"))).resolves.toBeUndefined();
  });
});

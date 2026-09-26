import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HttpError,
  describeFetchError,
  jsonFetcher,
  pollRetryDelayMs,
  postJson,
} from "@/app/_shared/utils/fetch-json";

// jsonFetcher/postJson: resposta não-ok LANÇA HttpError (o fetcher antigo da
// thread guardava `{ error }` como dado e esvaziava a conversa). Fetch
// mockado com vi.stubGlobal: sem rede.

function jsonResponse(status: number, body: unknown, statusText = ""): Response {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("jsonFetcher", () => {
  it("200 → devolve o JSON e pede sem cache", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { messages: [{ id: "m1" }], hasMore: false }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(jsonFetcher("/api/whatsapp/messages?contactId=c1")).resolves.toEqual({
      messages: [{ id: "m1" }],
      hasMore: false,
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/whatsapp/messages?contactId=c1", { cache: "no-store" });
  });

  it.each([
    [401, "Não autenticado"],
    [403, "Acesso à dashboard permitido apenas pela internet do escritório."],
    [500, "Falha ao carregar. Tente de novo."],
  ])("%i → HttpError com o status e o 'error' do corpo", async (status, error) => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(status, { error }, "Status")));
    const err = await jsonFetcher("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status, message: error, serverError: error });
  });

  it("corpo não-JSON → HttpError com o statusText", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>erro</html>", { status: 502, statusText: "Bad Gateway" })));
    const err = await jsonFetcher("/x").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).toMatchObject({ status: 502, message: "Bad Gateway", serverError: null });
  });

  it("corpo vazio e sem statusText → 'HTTP <status>'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    const err = await jsonFetcher("/x").catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 500, message: "HTTP 500", serverError: null });
  });

  it("'error' que não é texto é ignorado", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(403, { error: { code: 1 } }, "Forbidden")));
    const err = await jsonFetcher("/x").catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 403, message: "Forbidden", serverError: null });
  });

  it("falha de rede propaga o TypeError do fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(jsonFetcher("/x")).rejects.toBeInstanceOf(TypeError);
  });
});

describe("postJson", () => {
  it("envia Content-Type e o corpo em JSON", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(postJson("/api/x", { contactId: "c1" })).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: "c1" }),
      cache: "no-store",
    });
  });

  it("não-ok → HttpError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(403, { error: "Origem da requisição não permitida." })));
    await expect(postJson("/api/x", {})).rejects.toMatchObject({ status: 403, serverError: "Origem da requisição não permitida." });
  });
});

describe("describeFetchError", () => {
  it("401 = sessão vencida, com dica de F5", () => {
    expect(describeFetchError(new HttpError(401, "Não autenticado", "Não autenticado"))).toMatch(/sessão expirou.*F5/);
  });

  it("usa o texto da rota quando houver", () => {
    const msg = "Acesso à dashboard permitido apenas pela internet do escritório.";
    expect(describeFetchError(new HttpError(403, msg, msg))).toBe(msg);
  });

  it("sem texto da rota: genérico com o status (nunca o statusText em inglês)", () => {
    expect(describeFetchError(new HttpError(500, "Internal Server Error"))).toBe("Falha ao carregar (erro 500). Tente de novo.");
  });

  it("TypeError do fetch = sem conexão; o resto, genérico", () => {
    expect(describeFetchError(new TypeError("Failed to fetch"))).toMatch(/Sem conexão/);
    expect(describeFetchError(new Error("x"))).toBe("Falha ao carregar. Tente de novo.");
    expect(describeFetchError(undefined)).toBe("Falha ao carregar. Tente de novo.");
  });
});

describe("pollRetryDelayMs", () => {
  it("401 para de tentar (sessão vencida)", () => {
    expect(pollRetryDelayMs(new HttpError(401, "Não autenticado"), 1)).toBeNull();
  });

  it("403, 500 e rede tentam de novo: 5 s, 10 s, 20 s e depois a cada 30 s", () => {
    const err = new HttpError(403, "fora do escritório");
    expect([1, 2, 3, 4, 5, 50].map((n) => pollRetryDelayMs(err, n))).toEqual([5_000, 10_000, 20_000, 30_000, 30_000, 30_000]);
    expect(pollRetryDelayMs(new HttpError(500, "x"), 1)).toBe(5_000);
    expect(pollRetryDelayMs(new TypeError("Failed to fetch"), 2)).toBe(10_000);
  });

  it("retryCount inválido conta como a 1ª tentativa", () => {
    expect(pollRetryDelayMs(new Error("x"), 0)).toBe(5_000);
    expect(pollRetryDelayMs(new Error("x"), Number.NaN)).toBe(5_000);
  });
});

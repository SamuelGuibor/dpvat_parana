import { describe, expect, it } from "vitest";
import {
  AccessError,
  ROUTE_FAILURE_MESSAGE,
  guardFailure,
  isAccessError,
  isSameOrigin,
} from "@/app/_shared/utils/route-guards";

// Guardas das rotas da equipe (route-auth.ts): recusa de acesso = 403 com o
// motivo; erro de banco/rede = 500 genérico (nunca "sem acesso" por culpa do
// Neon); POST só da própria origem, comparando com x-forwarded-host (proxy da
// Vercel) antes do host.

describe("AccessError / isAccessError", () => {
  it("continua sendo Error (as actions que fazem catch seguem iguais)", () => {
    const err = new AccessError("Acesso restrito à equipe.");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AccessError");
    expect(err.message).toBe("Acesso restrito à equipe.");
  });

  it("reconhece por instanceof e, de reserva, pelo name (módulo duplicado entre bundles)", () => {
    expect(isAccessError(new AccessError("x"))).toBe(true);
    const copy = new Error("x");
    copy.name = "AccessError";
    expect(isAccessError(copy)).toBe(true);
  });

  it("não confunde com outros erros", () => {
    expect(isAccessError(new Error("Acesso restrito à equipe."))).toBe(false);
    expect(isAccessError("AccessError")).toBe(false);
    expect(isAccessError(null)).toBe(false);
    expect(isAccessError({ name: "AccessError", message: "x" })).toBe(false);
  });
});

describe("guardFailure", () => {
  it("recusa de acesso → 403 com o motivo", () => {
    expect(guardFailure(new AccessError("Acesso à dashboard permitido apenas pela internet do escritório."))).toEqual({
      status: 403,
      error: "Acesso à dashboard permitido apenas pela internet do escritório.",
    });
  });

  it("AccessError sem mensagem → 403 com o texto padrão", () => {
    expect(guardFailure(new AccessError(""))).toEqual({ status: 403, error: "Acesso restrito à equipe." });
  });

  it("erro do banco/rede → 500 genérico, sem vazar o texto do erro", () => {
    const neon = new Error("Timed out fetching a new connection from the connection pool");
    expect(guardFailure(neon)).toEqual({ status: 500, error: ROUTE_FAILURE_MESSAGE });
    expect(guardFailure(new TypeError("fetch failed"))).toEqual({ status: 500, error: ROUTE_FAILURE_MESSAGE });
    expect(guardFailure("qualquer coisa")).toEqual({ status: 500, error: ROUTE_FAILURE_MESSAGE });
    expect(guardFailure(undefined)).toEqual({ status: 500, error: ROUTE_FAILURE_MESSAGE });
  });
});

describe("isSameOrigin", () => {
  it("aceita Origin igual ao x-forwarded-host (produção atrás do proxy)", () => {
    expect(isSameOrigin("https://segurosparana.com.br", "segurosparana.com.br", "interno.vercel")).toBe(true);
  });

  it("sem x-forwarded-host cai no host (dev local, com porta)", () => {
    expect(isSameOrigin("http://localhost:3000", null, "localhost:3000")).toBe(true);
    expect(isSameOrigin("http://localhost:3000", "", "localhost:3000")).toBe(true);
  });

  it("x-forwarded-host vence o host", () => {
    expect(isSameOrigin("https://segurosparana.com.br", "outro.com", "segurosparana.com.br")).toBe(false);
  });

  it("usa o primeiro valor de x-forwarded-host encadeado e ignora caixa", () => {
    expect(isSameOrigin("https://SegurosParana.com.br", "segurosparana.com.br, proxy.interno", null)).toBe(true);
  });

  it("recusa origem de outro site ou de outra porta", () => {
    expect(isSameOrigin("https://evil.example", "segurosparana.com.br", null)).toBe(false);
    expect(isSameOrigin("http://localhost:4000", null, "localhost:3000")).toBe(false);
  });

  it("recusa sem Origin, Origin 'null' ou inválido", () => {
    expect(isSameOrigin(null, "segurosparana.com.br", null)).toBe(false);
    expect(isSameOrigin(undefined, "segurosparana.com.br", null)).toBe(false);
    expect(isSameOrigin("null", "segurosparana.com.br", null)).toBe(false);
    expect(isSameOrigin("não é url", "segurosparana.com.br", null)).toBe(false);
  });

  it("recusa quando não há host para comparar", () => {
    expect(isSameOrigin("https://segurosparana.com.br", null, null)).toBe(false);
  });
});

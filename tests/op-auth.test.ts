import { describe, it, expect, vi, beforeEach } from "vitest";

// Prisma mockado: o teste nunca toca o banco de produção.
const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/app/_shared/lib/prisma", () => ({
  db: { operatorToken: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) } },
}));
vi.mock("@vercel/functions", () => ({ waitUntil: () => {} }));

import {
  OpAuthError,
  generateOperatorToken,
  hashOperatorToken,
  operatorFromTokenRow,
  parseBearer,
  resolveOperator,
  type TokenRow,
} from "@/app/_shared/lib/op/auth";

const member = (role: string, permissions: unknown = null) => ({
  id: "u1",
  name: "Fulana",
  email: "fulana@segurosparana.test",
  role,
  permissions,
});
const row = (over: Partial<TokenRow> = {}): TokenRow => ({
  id: "t1",
  revokedAt: null,
  lastUsedAt: new Date(),
  user: member("ADMIN"),
  ...over,
});

function req(auth?: string, ip = "10.0.0.1") {
  return new Request("https://crm.test/api/op/tools", {
    headers: { ...(auth ? { authorization: auth } : {}), "x-forwarded-for": ip },
  });
}

describe("token do operador", () => {
  it("gera token com prefixo e hash sha256 estável", () => {
    const t = generateOperatorToken();
    expect(t).toMatch(/^crmop_[A-Za-z0-9_-]{43}$/);
    expect(hashOperatorToken(t)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashOperatorToken(t)).toBe(hashOperatorToken(t));
    expect(generateOperatorToken()).not.toBe(t);
  });

  it("parseBearer só aceita o formato do app", () => {
    expect(parseBearer("Bearer crmop_abc")).toBe("crmop_abc");
    expect(parseBearer("bearer crmop_abc ")).toBe("crmop_abc");
    expect(parseBearer("Bearer outro_abc")).toBeNull();
    expect(parseBearer("crmop_abc")).toBeNull();
    expect(parseBearer(null)).toBeNull();
  });
});

describe("operatorFromTokenRow", () => {
  it("inexistente e revogado → 401", () => {
    expect(() => operatorFromTokenRow(null)).toThrow(OpAuthError);
    try {
      operatorFromTokenRow(row({ revokedAt: new Date() }));
    } catch (e) {
      expect((e as OpAuthError).status).toBe(401);
      expect((e as OpAuthError).code).toBe("token_revogado");
    }
  });

  it("dono que é cliente/GHOST → 403", () => {
    for (const role of ["Filtro de Cartões", "GHOST"]) {
      try {
        operatorFromTokenRow(row({ user: member(role) }));
        throw new Error("deveria recusar");
      } catch (e) {
        expect((e as OpAuthError).status).toBe(403);
      }
    }
  });

  it("membro da equipe recebe as permissões do banco (override vale)", () => {
    const ctx = operatorFromTokenRow(row({ user: member("ADMIN", { view_whatsapp: false }) }));
    expect(ctx.userId).toBe("u1");
    expect(ctx.permissions.op_use).toBe(true);
    expect(ctx.permissions.view_whatsapp).toBe(false);
    expect(ctx.permissions.op_write).toBe(false);
  });
});

describe("resolveOperator", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
  });

  it("sem header → 401 sem_token, sem consultar o banco", async () => {
    await expect(resolveOperator(req())).rejects.toMatchObject({ status: 401, code: "sem_token" });
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("procura pelo HASH, nunca pelo token em claro", async () => {
    const token = generateOperatorToken();
    findUnique.mockResolvedValue(row());
    const ctx = await resolveOperator(req(`Bearer ${token}`, "10.0.0.2"));
    expect(ctx.tokenId).toBe("t1");
    expect(findUnique.mock.calls[0][0].where).toEqual({ tokenHash: hashOperatorToken(token) });
  });

  it("token desconhecido → 401", async () => {
    findUnique.mockResolvedValue(null);
    await expect(resolveOperator(req(`Bearer ${generateOperatorToken()}`, "10.0.0.3"))).rejects.toMatchObject({
      status: 401,
      code: "token_invalido",
    });
  });

  it("rate limit por token → 429", async () => {
    const token = generateOperatorToken();
    findUnique.mockResolvedValue(row());
    for (let i = 0; i < 120; i++) await resolveOperator(req(`Bearer ${token}`, "10.0.0.4"));
    await expect(resolveOperator(req(`Bearer ${token}`, "10.0.0.4"))).rejects.toMatchObject({ status: 429 });
  });
});

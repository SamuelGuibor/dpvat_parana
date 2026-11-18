import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  EXTERNAL_MESSAGES_DEFAULT_LIMIT,
  EXTERNAL_MESSAGES_MAX_LIMIT,
  externalMessageAuthor,
  parseExternalMessagesQuery,
  publicInteractive,
} from "@/app/_shared/utils/external-wa-messages";

// Prisma mockado: o teste nunca toca o banco de produção.
const findUnique = vi.fn();
const update = vi.fn();
vi.mock("@/app/_shared/lib/prisma", () => ({
  db: { apiToken: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) } },
}));
vi.mock("@vercel/functions", () => ({ waitUntil: () => {} }));

import {
  ApiAuthError,
  generateApiToken,
  hashApiToken,
  parseApiBearer,
  resolveApiToken,
} from "@/app/_shared/lib/api-token";

const q = (s: string) => parseExternalMessagesQuery(new URLSearchParams(s));

describe("parseExternalMessagesQuery", () => {
  it("sem phone ou phone inválido → erro (400)", () => {
    expect(q("").ok).toBe(false);
    expect(q("phone=123").ok).toBe(false);
  });

  it("normaliza o phone e monta as variantes", () => {
    const r = q("phone=(41)%2099999-8888");
    expect(r.ok && r.query.phone).toBe("5541999998888");
    expect(r.ok && r.query.variants).toEqual(["5541999998888", "554199998888"]);
  });

  it("limit: padrão 100, teto 500, lixo vira padrão", () => {
    const lim = (s: string) => { const r = q(`phone=5541999998888${s}`); return r.ok ? r.query.limit : -1; };
    expect(lim("")).toBe(EXTERNAL_MESSAGES_DEFAULT_LIMIT);
    expect(lim("&limit=20")).toBe(20);
    expect(lim("&limit=9999")).toBe(EXTERNAL_MESSAGES_MAX_LIMIT);
    expect(lim("&limit=0")).toBe(EXTERNAL_MESSAGES_DEFAULT_LIMIT);
    expect(lim("&limit=abc")).toBe(EXTERNAL_MESSAGES_DEFAULT_LIMIT);
  });

  it("before/after: ISO válido vira Date, inválido → erro", () => {
    const r = q("phone=5541999998888&before=2026-11-18T15:00:00.000Z");
    expect(r.ok && r.query.before?.toISOString()).toBe("2026-11-18T15:00:00.000Z");
    expect(q("phone=5541999998888&after=ontem").ok).toBe(false);
  });

  it("messages=0 tira as mensagens; includeMedia só com 1", () => {
    const r = q("phone=5541999998888&messages=0&includeMedia=1");
    expect(r.ok && r.query.withMessages).toBe(false);
    expect(r.ok && r.query.includeMedia).toBe(true);
    const d = q("phone=5541999998888");
    expect(d.ok && d.query.withMessages).toBe(true);
    expect(d.ok && d.query.includeMedia).toBe(false);
  });

  it("numberId com caractere estranho → erro", () => {
    expect(q("phone=5541999998888&numberId=abc'--").ok).toBe(false);
    const r = q("phone=5541999998888&numberId=cmabc123");
    expect(r.ok && r.query.numberId).toBe("cmabc123");
  });
});

describe("externalMessageAuthor", () => {
  it("cliente, equipe, bot e sistema", () => {
    expect(externalMessageAuthor({ direction: "in", sentByBot: false, authorId: null })).toBe("cliente");
    expect(externalMessageAuthor({ direction: "out", sentByBot: false, authorId: "u1" })).toBe("equipe");
    expect(externalMessageAuthor({ direction: "out", sentByBot: true, authorId: "u1" })).toBe("equipe");
    expect(externalMessageAuthor({ direction: "out", sentByBot: true, authorId: null })).toBe("bot");
    expect(externalMessageAuthor({ direction: "out", sentByBot: false, authorId: null })).toBe("sistema");
  });
});

describe("publicInteractive", () => {
  it("envio: só o que o cliente viu (sem token, ids internos nem motivo da Fila)", () => {
    const out = publicInteractive({
      kind: "flow", formVersionId: "fv1", metaFlowId: "m1", flowName: "aceite_termos", version: 2,
      token: "segredo", cta: "Abrir", header: "Termos", footer: null, screen: "S1",
      purpose: "terms", queueReason: "cliente qualificado, falta RG",
    });
    expect(out).toEqual({ kind: "flow", flowName: "aceite_termos", cta: "Abrir", header: "Termos", footer: null });
  });

  it("resposta: nome do formulário e campos preenchidos, sem token", () => {
    expect(publicInteractive({
      kind: "flow_reply", token: "x", formVersionId: "fv1", flowName: "cadastro",
      fields: [{ key: "cidade", label: "Cidade", value: "Curitiba" }],
    })).toEqual({ kind: "flow_reply", flowName: "cadastro", fields: [{ key: "cidade", label: "Cidade", value: "Curitiba" }] });
  });

  it("vazio ou formato desconhecido → null", () => {
    expect(publicInteractive(null)).toBeNull();
    expect(publicInteractive({ kind: "outro", queueReason: "x" })).toBeNull();
  });
});

describe("api-token", () => {
  beforeEach(() => { findUnique.mockReset(); update.mockReset(); });

  const req = (auth?: string, ip = "1.1.1.1") =>
    new Request("http://x/api/external/whatsapp/messages", {
      headers: { ...(auth ? { authorization: auth } : {}), "x-forwarded-for": ip },
    });

  it("gera com prefixo e o hash é sha256 hex", () => {
    const t = generateApiToken();
    expect(t.startsWith("crmapi_")).toBe(true);
    expect(hashApiToken(t)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("parseApiBearer só aceita o prefixo da API (não o do operador)", () => {
    expect(parseApiBearer("Bearer crmapi_abc")).toBe("crmapi_abc");
    expect(parseApiBearer("Bearer crmop_abc")).toBeNull();
    expect(parseApiBearer(null)).toBeNull();
  });

  it("sem token, inexistente e revogado: o mesmo 401", async () => {
    const err = async (r: Request) => resolveApiToken(r).then(() => null, (e) => e as ApiAuthError);
    const semToken = await err(req(undefined, "2.2.2.1"));
    findUnique.mockResolvedValueOnce(null);
    const invalido = await err(req("Bearer crmapi_nao_existe", "2.2.2.2"));
    findUnique.mockResolvedValueOnce({ id: "t1", label: "X", revokedAt: new Date(), lastUsedAt: null });
    const revogado = await err(req("Bearer crmapi_revogado", "2.2.2.3"));
    for (const e of [semToken, invalido, revogado]) {
      expect(e).toBeInstanceOf(ApiAuthError);
      expect(e?.status).toBe(401);
      expect(e?.message).toBe(semToken?.message);
    }
  });

  it("token ativo devolve id e label", async () => {
    findUnique.mockResolvedValueOnce({ id: "t2", label: "Sistema X", revokedAt: null, lastUsedAt: new Date() });
    await expect(resolveApiToken(req("Bearer crmapi_ok", "3.3.3.3"))).resolves.toEqual({ tokenId: "t2", label: "Sistema X" });
    expect(update).not.toHaveBeenCalled();
  });

  it("estourar 60/min no mesmo token → 429", async () => {
    findUnique.mockResolvedValue({ id: "t3", label: "X", revokedAt: null, lastUsedAt: new Date() });
    for (let i = 0; i < 60; i++) await resolveApiToken(req("Bearer crmapi_rajada", `4.4.${i}.1`));
    await expect(resolveApiToken(req("Bearer crmapi_rajada", "4.4.99.1"))).rejects.toMatchObject({ status: 429 });
  });
});

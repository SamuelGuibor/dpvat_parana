import { describe, it, expect } from "vitest";
import {
  canRun,
  canonicalHash,
  canonicalJson,
  maskCpf,
  maskPhone,
  stripSensitive,
  stripSensitiveArgs,
  truncate,
  OP_MAX_LEVEL,
} from "@/app/_shared/lib/op/policy";
import { resolvePermissions } from "@/app/_shared/lib/permissions";

describe("canRun", () => {
  const admin = resolvePermissions("ADMIN");
  const sa = resolvePermissions("ADMIN++");

  it("Etapa 1 só libera até L2", () => {
    expect(OP_MAX_LEVEL).toBe(2);
    expect(canRun(1, "op_use", admin)).toEqual({ ok: true });
    expect(canRun(3, "op_use", sa)).toMatchObject({ ok: false, code: "nivel_bloqueado" });
    expect(canRun(4, "op_use", sa)).toMatchObject({ ok: false, code: "nivel_bloqueado" });
  });

  it("sem op_use nada roda", () => {
    const perms = resolvePermissions("ADMIN", { op_use: false });
    expect(canRun(1, "op_use", perms)).toMatchObject({ ok: false, code: "sem_permissao" });
  });

  it("permissão da ferramenta vem do banco (view_whatsapp revogada)", () => {
    const perms = resolvePermissions("ADMIN", { view_whatsapp: false });
    expect(canRun(1, "view_whatsapp", perms)).toMatchObject({ ok: false, code: "sem_permissao" });
    expect(canRun(1, "view_whatsapp", admin)).toEqual({ ok: true });
  });

  it("read_only não bloqueia leitura", () => {
    const perms = resolvePermissions("ADMIN", { read_only: true });
    expect(canRun(1, "op_use", perms)).toEqual({ ok: true });
  });

  it("Somente Dashboard não usa a IA de operação, mesmo com op_use do cargo", () => {
    const perms = resolvePermissions("ADMIN", { dashboard_only: true });
    expect(perms.op_use).toBe(true);
    expect(canRun(1, "op_use", perms)).toMatchObject({ ok: false, code: "sem_permissao" });
  });

  it("cliente (não equipe) não roda nada", () => {
    expect(canRun(1, "op_use", resolvePermissions("Filtro de Cartões"))).toMatchObject({ ok: false });
  });
});

describe("hash canônico", () => {
  it("ordem das chaves não muda o hash; valor muda", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe('{"a":{"c":[3,{"e":0,"f":1}],"d":2},"b":1}');
    const h1 = canonicalHash("preparar_email", { para: "x@y", corpo: "oi" });
    const h2 = canonicalHash("preparar_email", { corpo: "oi", para: "x@y" });
    const h3 = canonicalHash("preparar_email", { corpo: "oi!", para: "x@y" });
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1).toMatch(/^[a-f0-9]{64}$/);
  });

  it("undefined some, null fica", () => {
    expect(canonicalJson({ a: undefined, b: null })).toBe('{"b":null}');
  });
});

describe("máscaras", () => {
  it("CPF em lista mostra só o meio", () => {
    expect(maskCpf("123.456.789-09")).toBe("***.456.789-**");
    expect(maskCpf("12345678909")).toBe("***.456.789-**");
    expect(maskCpf("123")).toBe("***");
    expect(maskCpf(null)).toBeNull();
  });

  it("telefone mostra os 4 últimos", () => {
    expect(maskPhone("(41) 99786-2323")).toBe("***2323");
    expect(maskPhone("")).toBeNull();
  });
});

describe("stripSensitive", () => {
  it("remove senha, senha do INSS e hashes em qualquer profundidade", () => {
    const out = stripSensitive({
      nome: "Fulano",
      password: "$2b$...",
      senha_inss: "segredo",
      cadastro: { cpf: "1", senha_inss: "x", tokenHash: "h" },
      lista: [{ permissions: { a: true }, ok: 1 }],
      quando: new Date(0),
    });
    expect(out).toEqual({ nome: "Fulano", cadastro: { cpf: "1" }, lista: [{ ok: 1 }], quando: new Date(0) });
  });

  it("args para auditoria mascaram CPF e telefone", () => {
    expect(stripSensitiveArgs({ cpf: "12345678909", telefone: "41997862323", nome: "Ana" })).toEqual({
      cpf: "***.456.789-**",
      telefone: "***2323",
      nome: "Ana",
    });
    expect(stripSensitiveArgs({ card: "123.456.789-09" })).toEqual({ card: "***.456.789-**" });
    expect(stripSensitiveArgs({ card: "2342" })).toEqual({ card: "2342" });
    expect(stripSensitiveArgs({ card: "(41) 99786-2323" })).toEqual({ card: "***2323" });
  });

  it("truncate respeita o teto", () => {
    expect(truncate("a".repeat(400)).length).toBe(300);
    expect(truncate("curto")).toBe("curto");
  });
});

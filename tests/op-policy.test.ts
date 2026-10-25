import { describe, it, expect } from "vitest";
import {
  canRun,
  canonicalHash,
  canonicalJson,
  stripSensitive,
  truncate,
  OP_MAX_LEVEL,
} from "@/app/_shared/lib/op/policy";
import { resolvePermissions } from "@/app/_shared/lib/permissions";

describe("canRun", () => {
  const admin = resolvePermissions("ADMIN");
  const sa = resolvePermissions("ADMIN++");

  it("Etapa 5 libera até L4; acima disso bloqueado", () => {
    expect(OP_MAX_LEVEL).toBe(4);
    expect(canRun(1, "op_use", admin)).toEqual({ ok: true });
    expect(canRun(3, "op_write", sa)).toEqual({ ok: true });
    expect(canRun(4, "op_approve", sa)).toEqual({ ok: true });
    expect(canRun(5 as never, "op_approve", sa)).toMatchObject({ ok: false, code: "nivel_bloqueado" });
  });

  it("L4 exige op_approve (padrão só ADMIN++) além de op_write; read_only e interruptor recusam", () => {
    expect(canRun(4, "op_approve", admin)).toMatchObject({ ok: false, code: "sem_permissao" });
    // preparar_whatsapp: permissão de domínio view_whatsapp + op_approve
    expect(canRun(4, "view_whatsapp", resolvePermissions("ADMIN", { op_write: true }))).toMatchObject({ ok: false, code: "sem_permissao" });
    expect(canRun(4, "view_whatsapp", resolvePermissions("ADMIN", { op_write: true, op_approve: true }))).toEqual({ ok: true });
    expect(canRun(4, "op_approve", resolvePermissions("ADMIN", { op_approve: true }))).toMatchObject({ ok: false, code: "sem_permissao" });
    expect(canRun(4, "op_approve", resolvePermissions("ADMIN", { op_write: true, op_approve: true, read_only: true }))).toMatchObject({ code: "somente_leitura" });
    expect(canRun(4, "op_approve", sa, false)).toMatchObject({ ok: false, code: "ferramenta_desligada" });
    expect(resolvePermissions("ADMIN").op_approve).toBe(false);
    expect(resolvePermissions("ADMIN+").op_approve).toBe(false);
  });

  it("L3 exige op_write (padrão só ADMIN++)", () => {
    expect(canRun(3, "op_write", admin)).toMatchObject({ ok: false, code: "sem_permissao" });
    expect(canRun(3, "op_write", resolvePermissions("ADMIN", { op_write: true }))).toEqual({ ok: true });
  });

  it("L3 recusa read_only e dashboard_only", () => {
    // ADMIN++ ignora overrides: os casos usam ADMIN com op_write concedido.
    expect(canRun(3, "op_write", resolvePermissions("ADMIN", { op_write: true, read_only: true }))).toMatchObject({ code: "somente_leitura" });
    expect(canRun(3, "op_write", resolvePermissions("ADMIN", { op_write: true, dashboard_only: true }))).toMatchObject({ code: "sem_permissao" });
  });

  it("L2 (rascunho) roda com op_use, sem op_write, e recusa read_only", () => {
    expect(canRun(2, "op_use", admin)).toEqual({ ok: true });
    expect(canRun(2, "op_use", resolvePermissions("ADMIN", { read_only: true }))).toMatchObject({ code: "somente_leitura" });
    expect(canRun(2, "op_use", resolvePermissions("ADMIN", { dashboard_only: true }))).toMatchObject({ code: "sem_permissao" });
  });

  it("interruptor desligado recusa antes de tudo", () => {
    expect(canRun(3, "op_write", sa, false)).toMatchObject({ ok: false, code: "ferramenta_desligada" });
  });

  it("arquivar exige archive_cards além de op_write", () => {
    const semArquivo = resolvePermissions("ADMIN", { op_write: true, archive_cards: false });
    expect(canRun(3, "archive_cards", semArquivo)).toMatchObject({ ok: false, code: "sem_permissao" });
    const semEscrita = resolvePermissions("ADMIN", { archive_cards: true });
    expect(canRun(3, "archive_cards", semEscrita)).toMatchObject({ ok: false, code: "sem_permissao" });
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

  it("CPF e telefone saem completos (decisão do dono); só senha/credencial some", () => {
    expect(stripSensitive({ cpf: "12345678909", telefone: "(41) 99786-2323", nome: "Ana", senha_inss: "x" })).toEqual({
      cpf: "12345678909",
      telefone: "(41) 99786-2323",
      nome: "Ana",
    });
  });

  it("truncate respeita o teto", () => {
    expect(truncate("a".repeat(400)).length).toBe(300);
    expect(truncate("curto")).toBe("curto");
  });
});

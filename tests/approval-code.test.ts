import { describe, it, expect } from "vitest";
import {
  APPROVAL_CODE_ALPHABET,
  APPROVAL_CODE_LENGTH,
  approvalCode,
  isApprovalExpired,
  typedApprovalMatches,
} from "@/app/_shared/utils/approval-code";

describe("código curto da aprovação", () => {
  it("4 caracteres do alfabeto sem ambiguidade, estável por id", () => {
    const c = approvalCode("apr123");
    expect(c).toHaveLength(APPROVAL_CODE_LENGTH);
    for (const ch of c) expect(APPROVAL_CODE_ALPHABET).toContain(ch);
    expect(approvalCode("apr123")).toBe(c);
    expect(APPROVAL_CODE_ALPHABET).not.toMatch(/[0O1IL5S2Z8B]/);
  });

  it("ids diferentes quase sempre dão códigos diferentes", () => {
    const codes = new Set(Array.from({ length: 200 }, (_, i) => approvalCode(`apr${i}`)));
    expect(codes.size).toBeGreaterThan(195);
  });
});

describe('"aprovo <código>" digitado', () => {
  const code = "K7QX";
  it("aceita caixa, acento, pontuação e as formas curtas", () => {
    expect(typedApprovalMatches("aprovo K7QX", code)).toBe(true);
    expect(typedApprovalMatches("Aprovo k7qx.", code)).toBe(true);
    expect(typedApprovalMatches("ok, APROVO K7QX pode mandar", code)).toBe(true);
    expect(typedApprovalMatches("aprovó K7QX", code)).toBe(true);
    expect(typedApprovalMatches("aprovo   K7QX\n", code)).toBe(true);
    expect(typedApprovalMatches("sim aprovo K7QX", code)).toBe(true);
    expect(typedApprovalMatches("aprovo K7QX, pode enviar!", code)).toBe(true);
  });

  it("a mensagem inteira tem que ser a aprovação (citação, pergunta ou texto longo não valem)", () => {
    expect(typedApprovalMatches("o que acontece se eu digitar aprovo K7QX?", code)).toBe(false);
    expect(typedApprovalMatches("peça para digitar: aprovo K7QX", code)).toBe(false);
    expect(typedApprovalMatches("aprovo K7QX mas troca o assunto antes", code)).toBe(false);
    expect(typedApprovalMatches(`aprovo K7QX ${"x".repeat(200)}`, code)).toBe(false);
  });

  it("recusa sem o código, código errado, colado ou de outra aprovação", () => {
    expect(typedApprovalMatches("aprovo", code)).toBe(false);
    expect(typedApprovalMatches("sim, pode mandar", code)).toBe(false);
    expect(typedApprovalMatches("aprovo K7QY", code)).toBe(false);
    expect(typedApprovalMatches("aprovo K7QXA", code)).toBe(false);
    expect(typedApprovalMatches("desaprovo K7QX", code)).toBe(false);
    expect(typedApprovalMatches("K7QX", code)).toBe(false);
    expect(typedApprovalMatches("aprovo " + approvalCode("outra"), code)).toBe(approvalCode("outra") === code);
  });

  it("negação logo antes não vale", () => {
    expect(typedApprovalMatches("não aprovo K7QX", code)).toBe(false);
    expect(typedApprovalMatches("nao aprovo K7QX", code)).toBe(false);
    expect(typedApprovalMatches("nunca aprovo K7QX", code)).toBe(false);
  });

  it("vencimento", () => {
    const now = Date.now();
    expect(isApprovalExpired(new Date(now - 1), now)).toBe(true);
    expect(isApprovalExpired(new Date(now + 60_000), now)).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { normalizePhoneBR, phoneVariantsBR } from "@/app/_shared/utils/phone-variants";

describe("normalizePhoneBR", () => {
  it("põe o 55 e tira máscara e zero de operadora", () => {
    expect(normalizePhoneBR("(41) 99999-8888")).toBe("5541999998888");
    expect(normalizePhoneBR("+55 41 99999-8888")).toBe("5541999998888");
    expect(normalizePhoneBR("041 3333-4444")).toBe("554133334444");
  });

  it("recusa número curto, longo ou vazio", () => {
    expect(normalizePhoneBR("")).toBeNull();
    expect(normalizePhoneBR("9999-8888")).toBeNull();
    expect(normalizePhoneBR("55419999988881")).toBeNull();
  });
});

describe("phoneVariantsBR", () => {
  it("celular com 9: ele e a forma sem o 9", () => {
    expect(phoneVariantsBR("5541999998888")).toEqual(["5541999998888", "554199998888"]);
  });

  it("celular antigo sem 9: ele e a forma com o 9", () => {
    expect(phoneVariantsBR("554199998888")).toEqual(["554199998888", "5541999998888"]);
    expect(phoneVariantsBR("554188887777")).toEqual(["554188887777", "5541988887777"]);
  });

  it("com e sem 9 dão o mesmo par (acham o mesmo contato)", () => {
    expect(new Set(phoneVariantsBR("5541999998888"))).toEqual(new Set(phoneVariantsBR("554199998888")));
    expect(new Set(phoneVariantsBR("5541912345678"))).toEqual(new Set(phoneVariantsBR("554112345678")));
  });

  it("celular novo 9 0/1xxx: o sem 9 (que não pode ser fixo) também acha", () => {
    expect(phoneVariantsBR("554112345678")).toEqual(["554112345678", "5541912345678"]);
    expect(phoneVariantsBR("5541912345678")).toEqual(["5541912345678", "554112345678"]);
  });

  it("cara de fixo (núcleo 2–5): só a forma exata, nos dois sentidos", () => {
    // Fixo não ganha 9 (seria o celular de outra pessoa)…
    expect(phoneVariantsBR("554133334444")).toEqual(["554133334444"]);
    expect(phoneVariantsBR("551155556666")).toEqual(["551155556666"]);
    // …e celular 9 3xxx não perde o 9 (seria o fixo de outra pessoa).
    expect(phoneVariantsBR("5541933334444")).toEqual(["5541933334444"]);
  });

  it("nunca troca o DDD", () => {
    for (const v of phoneVariantsBR("5541999998888")) expect(v.slice(2, 4)).toBe("41");
    expect(phoneVariantsBR("5541999998888")).not.toContain("5543999998888");
  });

  it("9 dígitos sem 9 na frente: só ele", () => {
    expect(phoneVariantsBR("5541899998888")).toEqual(["5541899998888"]);
  });

  it("fora do formato → vazio", () => {
    expect(phoneVariantsBR("41999998888")).toEqual([]);
    expect(phoneVariantsBR("55419999")).toEqual([]);
    expect(phoneVariantsBR("abc")).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import {
  parseMoneyToCents, formatMoney, formatMonthLabel, costServiceLabel, costServiceColor,
} from "@/app/_shared/lib/costs";

// Dinheiro é guardado em centavos (Int). A leitura do que a pessoa digita é o
// ponto frágil: teclado brasileiro usa vírgula decimal, mas fatura copiada de
// provedor gringo vem com ponto.

describe("parseMoneyToCents", () => {
  it("lê vírgula como separador decimal", () => {
    expect(parseMoneyToCents("109,90")).toBe(10990);
    expect(parseMoneyToCents("0,50")).toBe(50);
  });

  it("lê ponto como decimal quando não há vírgula", () => {
    expect(parseMoneyToCents("1234.56")).toBe(123456);
    expect(parseMoneyToCents("20.00")).toBe(2000);
  });

  it("trata ponto como milhar quando há vírgula", () => {
    expect(parseMoneyToCents("1.234,56")).toBe(123456);
    expect(parseMoneyToCents("12.345.678,90")).toBe(1234567890);
  });

  it("ignora símbolo de moeda e espaços", () => {
    expect(parseMoneyToCents("R$ 109,90")).toBe(10990);
    expect(parseMoneyToCents("US$ 20.00")).toBe(2000);
    expect(parseMoneyToCents("  45,00  ")).toBe(4500);
  });

  it("aceita valor inteiro sem casas", () => {
    expect(parseMoneyToCents("100")).toBe(10000);
  });

  it("devolve null quando não há número", () => {
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("R$")).toBeNull();
  });

  it("não perde centavo por arredondamento de float", () => {
    expect(parseMoneyToCents("8,15")).toBe(815);
    // "1,005" * 100 dá 100.4999... em float e cairia para R$ 1,00.
    expect(parseMoneyToCents("1,005")).toBe(101);
    expect(parseMoneyToCents("1,999")).toBe(200);
    expect(parseMoneyToCents("1,004")).toBe(100);
  });

  it("rejeita entrada com pontuação sem sentido", () => {
    expect(parseMoneyToCents("1,2,3")).toBeNull();
    expect(parseMoneyToCents(",")).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formata centavos em real e dólar", () => {
    //   é o espaço fixo que o Intl usa entre símbolo e número.
    expect(formatMoney(10990).replace(/ /g, " ")).toBe("R$ 109,90");
    expect(formatMoney(2000, "USD").replace(/ /g, " ")).toBe("US$ 20,00");
  });

  it("formata zero e valores com milhar", () => {
    expect(formatMoney(0).replace(/ /g, " ")).toBe("R$ 0,00");
    expect(formatMoney(123456).replace(/ /g, " ")).toBe("R$ 1.234,56");
  });
});

describe("formatMonthLabel", () => {
  it("converte YYYY-MM em rótulo curto", () => {
    expect(formatMonthLabel("2026-08")).toBe("ago/2026");
    expect(formatMonthLabel("2026-01")).toBe("jan/2026");
    expect(formatMonthLabel("2025-12")).toBe("dez/2025");
  });
});

describe("catálogo de serviços", () => {
  it("resolve rótulo e cor dos serviços conhecidos", () => {
    expect(costServiceLabel("vercel")).toBe("Vercel");
    expect(costServiceLabel("claude")).toBe("Claude (Anthropic)");
    expect(costServiceColor("aws")).toBe("#ff9900");
  });

  it("cai no próprio valor quando o serviço é desconhecido", () => {
    expect(costServiceLabel("qualquer")).toBe("qualquer");
    expect(costServiceColor("qualquer")).toBe("#64748b");
  });
});

import { describe, it, expect } from "vitest";
import {
  onlyDigits,
  maskCpf,
  isValidCpf,
  formatPhone,
  maskPhone,
  maskCep,
  formatCpf,
} from "@/app/_shared/utils/format";

describe("onlyDigits", () => {
  it("remove tudo que não é dígito", () => {
    expect(onlyDigits("(41) 99786-2323")).toBe("41997862323");
    expect(onlyDigits(null)).toBe("");
    expect(onlyDigits(undefined)).toBe("");
  });
});

describe("maskCpf", () => {
  it("aplica máscara progressiva", () => {
    expect(maskCpf("048")).toBe("048");
    expect(maskCpf("048123")).toBe("048.123");
    expect(maskCpf("048123456")).toBe("048.123.456");
    expect(maskCpf("04812345678")).toBe("048.123.456-78");
  });
  it("descarta excedente e não-dígitos", () => {
    expect(maskCpf("048.123.456-78999")).toBe("048.123.456-78");
    expect(maskCpf("abc")).toBe("");
  });
});

describe("isValidCpf", () => {
  it("aceita CPFs válidos", () => {
    // CPFs de exemplo com dígitos verificadores corretos.
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224725")).toBe(true);
  });
  it("rejeita dígito verificador errado", () => {
    expect(isValidCpf("529.982.247-26")).toBe(false);
  });
  it("rejeita sequências repetidas e tamanhos errados", () => {
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
    expect(isValidCpf("")).toBe(false);
  });
});

describe("formatPhone", () => {
  it("formata celular com e sem DDI", () => {
    expect(formatPhone("5541997862323")).toBe("(41) 99786-2323");
    expect(formatPhone("41997862323")).toBe("(41) 99786-2323");
  });
  it("formata fixo de 10 dígitos", () => {
    expect(formatPhone("4133334444")).toBe("(41) 3333-4444");
  });
  it("devolve o original quando não reconhece", () => {
    expect(formatPhone("123")).toBe("123");
    expect(formatPhone("")).toBe("");
  });
});

describe("maskPhone", () => {
  it("máscara progressiva", () => {
    expect(maskPhone("41")).toBe("(41");
    expect(maskPhone("4199786")).toBe("(41) 99786");
    expect(maskPhone("41997862323")).toBe("(41) 99786-2323");
  });
});

describe("maskCep", () => {
  it("formata CEP", () => {
    expect(maskCep("80010010")).toBe("80010-010");
    expect(maskCep("800")).toBe("800");
  });
});

describe("formatCpf", () => {
  it("formata CPF completo e preserva incompleto", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(formatCpf("529")).toBe("529");
  });
});

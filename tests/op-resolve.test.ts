import { describe, it, expect } from "vitest";
import {
  brDaysBetween,
  matchColumn,
  normalizeColumnName,
  parseCardRef,
} from "@/app/_shared/lib/op/resolve";

describe("parseCardRef", () => {
  it("número do processo em vários formatos", () => {
    for (const s of ["2342", "#2342", "# 2342", "processo 2342", "Processo 2342", "proc. 2342", "card 2342", "nº 2342"]) {
      expect(parseCardRef(s)).toEqual({ kind: "cardNumber", value: 2342 });
    }
  });

  it("CPF com dígito válido (com ou sem máscara)", () => {
    expect(parseCardRef("123.456.789-09")).toEqual({ kind: "cpf", value: "12345678909" });
    expect(parseCardRef("12345678909")).toEqual({ kind: "cpf", value: "12345678909" });
  });

  it("11 dígitos sem CPF válido = telefone", () => {
    expect(parseCardRef("41997862323")).toEqual({ kind: "phone", value: "41997862323" });
    expect(parseCardRef("(41) 99786-2323")).toEqual({ kind: "phone", value: "41997862323" });
    expect(parseCardRef("+55 41 99786-2323")).toEqual({ kind: "phone", value: "5541997862323" });
  });

  it("cuid e nome", () => {
    expect(parseCardRef("cmh1x2y3z4a5b6c7d8e9f0g1h")).toEqual({ kind: "id", value: "cmh1x2y3z4a5b6c7d8e9f0g1h" });
    expect(parseCardRef("Maria da Silva")).toEqual({ kind: "name", value: "Maria da Silva" });
    expect(parseCardRef("  ")).toBeNull();
  });

  it("CPF com dígito errado ou repetido não é CPF", () => {
    expect(parseCardRef("12345678900")).toEqual({ kind: "phone", value: "12345678900" });
    expect(parseCardRef("11111111111")).toEqual({ kind: "phone", value: "11111111111" });
  });
});

describe("colunas", () => {
  const COLS = [
    "Filtro de Cartões",
    "FALTA SENHA - SOLICITADO",
    "COM SENHA - SOLICITADO",
    "AGUARDANDO SAIR DATA PERÍCIA INSS",
    "PERÍCIA INSS AGENDADA",
    "REVISÃO PRÉ-PASTA |UNI",
    "EM ANALISE UNI",
  ];

  it("normaliza acento, caixa e pontuação", () => {
    expect(normalizeColumnName("Falta Senha – Solicitado")).toBe("FALTA SENHA SOLICITADO");
    expect(normalizeColumnName("REVISÃO PRÉ-PASTA |UNI")).toBe("REVISAO PRE PASTA UNI");
  });

  it("igual normalizado = exact", () => {
    expect(matchColumn(COLS, "falta senha solicitado")).toEqual({ exact: "FALTA SENHA - SOLICITADO" });
    expect(matchColumn(COLS, "em análise uni")).toEqual({ exact: "EM ANALISE UNI" });
  });

  it("parcial com várias opções = candidatas", () => {
    expect(matchColumn(COLS, "senha")).toEqual({
      exact: null,
      candidates: ["FALTA SENHA - SOLICITADO", "COM SENHA - SOLICITADO"],
    });
    expect(matchColumn(COLS, "pericia")).toEqual({
      exact: null,
      candidates: ["AGUARDANDO SAIR DATA PERÍCIA INSS", "PERÍCIA INSS AGENDADA"],
    });
  });

  it("palavra no começo de palavra; nada parecido = vazio", () => {
    expect(matchColumn(COLS, "revisão uni")).toEqual({ exact: null, candidates: ["REVISÃO PRÉ-PASTA |UNI"] });
    expect(matchColumn(COLS, "aguardando documentos")).toEqual({ exact: null, candidates: [] });
    expect(matchColumn(COLS, "")).toEqual({ exact: null, candidates: [] });
  });
});

describe("brDaysBetween", () => {
  it("conta dias de calendário em Brasília, não em UTC", () => {
    // 23:30 de Brasília (02:30 UTC do dia seguinte) → 00:30 de Brasília do dia seguinte = 1 dia.
    expect(brDaysBetween(new Date("2026-10-21T02:30:00Z"), new Date("2026-10-21T03:30:00Z"))).toBe(1);
    // Mesmo dia em Brasília.
    expect(brDaysBetween(new Date("2026-10-20T12:00:00Z"), new Date("2026-10-21T02:00:00Z"))).toBe(0);
    expect(brDaysBetween(new Date("2026-10-01T15:00:00Z"), new Date("2026-10-24T15:00:00Z"))).toBe(23);
  });
});

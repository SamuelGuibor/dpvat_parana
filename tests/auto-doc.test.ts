import { describe, expect, it } from "vitest";
import { parseAutoDocResult } from "@/app/_shared/utils/auto-doc";

describe("parseAutoDocResult", () => {
  it("normaliza um documento do INSS com afastamento", () => {
    const r = parseAutoDocResult({
      ehDocumento: true,
      tipo: "cnis",
      pasta: "docs_inss",
      afastamento: { situacao: "Sim", inicio: "01/02/2026", fim: "2026-03-01", evidencia: "  B31  ativo " },
    });
    expect(r).toEqual({
      ehDocumento: true,
      tipo: "CNIS",
      pasta: "DOCS_INSS",
      afastamento: { situacao: "sim", inicio: "01/02/2026", fim: null, evidencia: "B31 ativo" },
    });
  });

  it("aceita 'não' com acento e tira caractere inválido do tipo", () => {
    const r = parseAutoDocResult({ ehDocumento: "true", tipo: "RG/CPF", afastamento: { situacao: "não" } });
    expect(r.tipo).toBe("RG CPF");
    expect(r.afastamento.situacao).toBe("nao");
  });

  it("lixo ou não documento vira não anexar, sem afastamento", () => {
    expect(parseAutoDocResult(null).ehDocumento).toBe(false);
    const r = parseAutoDocResult({ ehDocumento: false, afastamento: { situacao: "sim" } });
    expect(r.afastamento.situacao).toBe("indefinido");
  });
});

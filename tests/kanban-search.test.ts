import { describe, expect, it } from "vitest";
import { kanbanSearchHint, kanbanSearchMatch, type SearchableCard } from "@/app/_shared/utils/kanban-filters";

// T-OM736: busca do board também por hospital, cidade e estado.
const card = (over: Partial<SearchableCard> = {}): SearchableCard => ({
  name: "Maria da Silva",
  cardNumber: 4001,
  cpf: "52998224725",
  telefone: "5541999990000",
  hospital: "Hospital Universitário Cajuru",
  cidade: "Ponta Grossa",
  estado: "PR",
  ...over,
});

describe("kanbanSearchMatch", () => {
  it("nome, número, CPF e telefone como antes", () => {
    expect(kanbanSearchMatch(card(), "maria")).toBe("nome");
    expect(kanbanSearchMatch(card(), "4001")).toBe("numero");
    expect(kanbanSearchMatch(card(), "529.982")).toBe("cpf");
    expect(kanbanSearchMatch(card(), "99999")).toBe("telefone");
  });

  it("hospital e cidade sem acento/caixa, com 3+ letras", () => {
    expect(kanbanSearchMatch(card(), "cajuru")).toBe("hospital");
    expect(kanbanSearchMatch(card(), "universitario")).toBe("hospital");
    expect(kanbanSearchMatch(card(), "ponta gr")).toBe("cidade");
    expect(kanbanSearchMatch(card(), "po")).toBeNull();
  });

  it("outro_hospital quando a lista diz Outro", () => {
    expect(kanbanSearchMatch(card({ hospital: "Outro", outro_hospital: "Santa Casa de Irati" }), "irati")).toBe("hospital");
  });

  it("estado pela sigla exata ou pelo nome, gravado de qualquer jeito", () => {
    expect(kanbanSearchMatch(card(), "pr")).toBe("estado");
    expect(kanbanSearchMatch(card(), "parana")).toBe("estado");
    expect(kanbanSearchMatch(card({ estado: "Paraná" }), "PR")).toBe("estado");
    expect(kanbanSearchMatch(card({ estado: "Santa Catarina" }), "pr")).toBeNull();
  });

  it("busca só de dígitos não cai em texto; sem bater = null", () => {
    expect(kanbanSearchMatch(card({ cidade: "123 Cidade" }), "123")).toBeNull();
    expect(kanbanSearchMatch(card(), "joinville")).toBeNull();
  });

  it("dica mostra o porquê só fora do nome/número", () => {
    expect(kanbanSearchHint(card(), "hospital")).toBe("Hospital: Hospital Universitário Cajuru");
    expect(kanbanSearchHint(card(), "cidade")).toBe("Cidade: Ponta Grossa / PR");
    expect(kanbanSearchHint(card(), "nome")).toBeNull();
  });
});

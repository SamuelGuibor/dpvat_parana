import { describe, it, expect } from "vitest";
import { compararContatos, nextStatus, shortTicketId, statusesFor, temConflito } from "@/app/_shared/utils/cerebro";

describe("fluxo do Cérebro APP", () => {
  it("ticket comum pula a Validação IA; conhecimento passa por ela", () => {
    expect(nextStatus("BUG", "EM_DESENVOLVIMENTO")).toBe("CONCLUIDO");
    expect(nextStatus("CONHECIMENTO", "EM_DESENVOLVIMENTO")).toBe("VALIDACAO_IA");
    expect(nextStatus("LACUNA", "VALIDACAO_IA")).toBe("CONCLUIDO");
    expect(nextStatus("BUG", "CONCLUIDO")).toBeNull();
    expect(statusesFor("BUG")).not.toContain("VALIDACAO_IA");
    expect(statusesFor("DESATUALIZADO")).toContain("VALIDACAO_IA");
  });
  it("id curto por tipo", () => {
    expect(shortTicketId("cmh3xabcdek2p9z", "CONHECIMENTO")).toBe("C-K2P9Z");
    expect(shortTicketId("cmh3xabcdek2p9z", "BUG")).toBe("T-K2P9Z");
    expect(shortTicketId("cmh3xabcdek2p9z", "LACUNA")).toBe("L-K2P9Z");
  });
});

describe("compararContatos", () => {
  const hoje = 'De ".curitiba" para "same@cruzvermelhapr.com.br". Tel (41) 3333-4444.';
  it("e-mail diferente = conflito; telefone não citado = sem mudança", () => {
    const c = compararContatos(hoje, "Mandar para prontuario@cruzvermelhapr.com.br");
    expect(c).toEqual([
      { campo: "e-mail", hoje: ["same@cruzvermelhapr.com.br"], proposta: ["prontuario@cruzvermelhapr.com.br"], situacao: "conflito" },
      { campo: "telefone", hoje: ["(41) 3333-4444"], proposta: [], situacao: "sem_mudanca" },
    ]);
    expect(temConflito({ comparacao: c })).toBe(true);
  });
  it("mesmo contato em outro formato = igual; contato novo = novo", () => {
    const c = compararContatos(hoje, "Ligar 41 3333-4444 ou ver https://site.org/p");
    expect(c.find((x) => x.campo === "telefone")?.situacao).toBe("igual");
    expect(c.find((x) => x.campo === "link")?.situacao).toBe("novo");
    expect(temConflito({ comparacao: c })).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import {
  TIPO_DO_DESTINO,
  compararContatos,
  destinoDoTipo,
  isKnowledgeType,
  nextStatus,
  parseShortTicketId,
  shortTicketId,
  skillProtegida,
  skillValida,
  statusesFor,
  temConflito,
} from "@/app/_shared/utils/cerebro";

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

describe("destinos do Cérebro APP (vault, skill, bot)", () => {
  it("SKILL e BOT são de conhecimento e passam pela Validação IA", () => {
    for (const t of ["SKILL", "BOT"]) {
      expect(isKnowledgeType(t)).toBe(true);
      expect(nextStatus(t, "EM_DESENVOLVIMENTO")).toBe("VALIDACAO_IA");
      expect(statusesFor(t)).toContain("VALIDACAO_IA");
    }
    expect(isKnowledgeType("MELHORIA")).toBe(false);
  });

  it("destino ↔ tipo", () => {
    expect(TIPO_DO_DESTINO).toEqual({ vault: "CONHECIMENTO", skill: "SKILL", bot: "BOT" });
    expect(destinoDoTipo("SKILL")).toBe("skill");
    expect(destinoDoTipo("BOT")).toBe("bot");
    expect(destinoDoTipo("LACUNA")).toBe("vault");
    expect(destinoDoTipo("CONHECIMENTO")).toBe("vault");
    expect(destinoDoTipo("BUG")).toBeNull();
  });

  it("id curto por tipo e leitura de volta", () => {
    const id = "cmh3xabcdek2p9x";
    expect(shortTicketId(id, "SKILL")).toBe("S-K2P9X");
    expect(shortTicketId(id, "BOT")).toBe("B-K2P9X");
    expect(parseShortTicketId("S-K2P9X")).toBe("k2p9x");
    expect(parseShortTicketId("k2p9x")).toBe("k2p9x");
    expect(parseShortTicketId(id)).toBe(id);
    expect(parseShortTicketId("S-K2")).toBeNull();
    expect(parseShortTicketId("rm -rf")).toBeNull();
  });

  it("nome de skill e skills protegidas (D6)", () => {
    expect(skillValida("meu-dia")).toBe(true);
    expect(skillValida("../hooks")).toBe(false);
    expect(skillValida("Meu Dia")).toBe(false);
    for (const s of ["plano", "validar", "migration", "mapa-atualizar", "crm"]) expect(skillProtegida(s)).toBe(true);
    expect(skillProtegida("meu-dia")).toBe(false);
  });
});

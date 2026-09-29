import { describe, expect, it } from "vitest";
import { closedFolderOf } from "@/app/_shared/utils/inbox-folders";

// Pasta de cada conversa encerrada no rail do inbox (auditoria de 24/09/2026):
// churn ganhou pasta própria e categoria sem pasta cai em 'outros', para a
// lista com busca/tag bater com o contador de resultados.

const closed = (closeCategory: string | null, qualified: boolean | null = null) => ({ closeCategory, qualified });

describe("closedFolderOf", () => {
  it("churn tem pasta própria", () => {
    expect(closedFolderOf(closed("contratado_perdido", true))).toBe("churn");
  });

  it("não qualificado genérico e sub-motivos nq_* vão para 'unqualified'", () => {
    expect(closedFolderOf(closed("nao_qualificado", false))).toBe("unqualified");
    expect(closedFolderOf(closed("nq_x", false))).toBe("unqualified");
    expect(closedFolderOf(closed("nq_acidente_muito_antigo"))).toBe("unqualified");
  });

  it("sem closeCategory usa o `qualified` antigo", () => {
    expect(closedFolderOf(closed(null, true))).toBe("qualified");
    expect(closedFolderOf(closed(null, false))).toBe("unqualified");
    expect(closedFolderOf(closed(null, null))).toBe("unqualified");
  });

  it("cada desfecho conhecido na sua pasta", () => {
    expect(closedFolderOf(closed("qualificado", true))).toBe("qualified");
    expect(closedFolderOf(closed("sem_resposta"))).toBe("sem_resposta");
    expect(closedFolderOf(closed("perguntas"))).toBe("perguntas");
    expect(closedFolderOf(closed("novo_acidente"))).toBe("novo_acidente");
    expect(closedFolderOf(closed("transferido"))).toBe("transferido");
    expect(closedFolderOf(closed("descartado"))).toBe("descartado");
  });

  it("categoria sem pasta cai em 'outros' (rede de segurança)", () => {
    expect(closedFolderOf(closed("categoria_nova"))).toBe("outros");
    expect(closedFolderOf(closed("constructor"))).toBe("outros");
  });
});

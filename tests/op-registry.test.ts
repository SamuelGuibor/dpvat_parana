import { describe, it, expect } from "vitest";
import { OP_TOOLS, getTool } from "@/app/_shared/lib/op/tools";
import { catalogEntry } from "@/app/_shared/lib/op/registry";
import { PERMISSION_KEYS } from "@/app/_shared/lib/permissions";

const ETAPA_1 = [
  "buscar_cliente",
  "obter_card",
  "listar_historico",
  "listar_documentos",
  "listar_colunas",
  "listar_tags",
  "listar_cards_parados",
  "listar_cards_coluna",
  "verificar_pendencias",
  "consultar_conversa",
];

describe("registry da operação por IA", () => {
  it("as 10 ferramentas da Etapa 1, nomes únicos", () => {
    const names = OP_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual([...ETAPA_1].sort());
  });

  it("todas são L1 (nenhuma escrita nesta etapa) e com permissão existente", () => {
    for (const t of OP_TOOLS) {
      expect(t.level).toBe(1);
      expect(PERMISSION_KEYS).toContain(t.permission);
      expect(t.description.length).toBeGreaterThan(30);
    }
    expect(getTool("consultar_conversa")?.permission).toBe("view_whatsapp");
  });

  it("nenhuma ferramenta de escrita no catálogo", () => {
    for (const t of OP_TOOLS) expect(t.name).not.toMatch(/^(mover|adicionar|remover|comentar|criar|arquivar|executar|enviar)/);
  });

  it("zod → JSON Schema é objeto, sem $schema, com required coerente", () => {
    for (const t of OP_TOOLS) {
      const s = catalogEntry(t).inputSchema;
      expect(s.type).toBe("object");
      expect(s.$schema).toBeUndefined();
      expect(typeof s.properties).toBe("object");
    }
    const card = catalogEntry(getTool("obter_card")!).inputSchema as { required?: string[]; properties: Record<string, unknown> };
    expect(card.required).toEqual(["card"]);
    // default não vira obrigatório na entrada
    const hist = catalogEntry(getTool("listar_historico")!).inputSchema as { required?: string[] };
    expect(hist.required).toEqual(["card"]);
  });

  it("schemas validam o que o modelo manda", () => {
    expect(getTool("obter_card")!.schema.safeParse({ card: "2342" }).success).toBe(true);
    expect(getTool("obter_card")!.schema.safeParse({}).success).toBe(false);
    expect(getTool("buscar_cliente")!.schema.safeParse({}).success).toBe(false);
    expect(getTool("buscar_cliente")!.schema.safeParse({ nome: "Ana" }).success).toBe(true);
    expect(getTool("listar_historico")!.schema.safeParse({ card: "1", limite: 500 }).success).toBe(false);
    expect(getTool("listar_documentos")!.schema.safeParse({ card: "1", pasta: "XPTO" }).success).toBe(false);
  });
});

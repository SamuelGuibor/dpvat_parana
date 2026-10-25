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
const ETAPA_2 = ["consultar_hospital", "minhas_permissoes"];
const ETAPA_3_L1 = ["meu_dia"];
const ETAPA_3 = ["mover_card", "adicionar_tag", "remover_tag", "comentar_card", "notificar_pessoa", "arquivar_card"];
const ETAPA_4_L1 = ["listar_modelos"];
const ETAPA_4_L2 = ["preparar_procuracao", "preparar_pedido_prontuario", "preparar_contrato"];
const ETAPA_4_L3 = ["anexar_rascunho"];
const L3 = [...ETAPA_3, ...ETAPA_4_L3];

describe("registry da operação por IA", () => {
  it("Etapas 1–2 + meu_dia + 6 de escrita da Etapa 3 + documentos da Etapa 4, nomes únicos", () => {
    const names = OP_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(
      [...ETAPA_1, ...ETAPA_2, ...ETAPA_3_L1, ...ETAPA_3, ...ETAPA_4_L1, ...ETAPA_4_L2, ...ETAPA_4_L3].sort(),
    );
  });

  it("consultar_hospital exige hospital ou card", () => {
    const t = getTool("consultar_hospital")!;
    expect(t.schema.safeParse({}).success).toBe(false);
    expect(t.schema.safeParse({ hospital: "angelina caron" }).success).toBe(true);
    expect(t.schema.safeParse({ card: "2342" }).success).toBe(true);
  });

  it("L3 só nas listas de escrita (op_write/archive_cards); L2 só nas preparar_*; o resto é L1", () => {
    for (const t of OP_TOOLS) {
      expect(PERMISSION_KEYS).toContain(t.permission);
      expect(t.description.length).toBeGreaterThan(30);
      if (L3.includes(t.name)) {
        expect(t.level).toBe(3);
        expect(["op_write", "archive_cards"]).toContain(t.permission);
        expect(t.description).toMatch(/^ESCRITA\./);
      } else if (ETAPA_4_L2.includes(t.name)) {
        expect(t.level).toBe(2);
        expect(t.permission).toBe("op_use");
        expect(t.description).toMatch(/^PREPARA /);
      } else {
        expect(t.level).toBe(1);
      }
    }
    expect(getTool("consultar_conversa")?.permission).toBe("view_whatsapp");
    expect(getTool("arquivar_card")?.permission).toBe("archive_cards");
  });

  it("nenhuma ferramenta de envio externo, lote ou execução de aprovado", () => {
    for (const t of OP_TOOLS) expect(t.name).not.toMatch(/^(enviar|executar|criar_card|mudar_etapa)/);
  });

  it("L3 sem confirmar = prévia (confirmar padrão false); nenhuma aceita lista de cards", () => {
    for (const name of L3) {
      const t = getTool(name)!;
      const s = catalogEntry(t).inputSchema as { properties: Record<string, { type?: string }> };
      expect(s.properties.confirmar).toBeDefined();
      expect(s.properties.previa_hash).toBeDefined();
      if (s.properties.card) expect(s.properties.card.type).toBe("string");
    }
    const parsed = getTool("mover_card")!.schema.safeParse({ card: "2342", coluna: "AUDITORIA" });
    expect(parsed.success && (parsed.data as { confirmar: boolean }).confirmar).toBe(false);
    expect(getTool("arquivar_card")!.schema.safeParse({ card: "1" }).success).toBe(false);
    expect(getTool("arquivar_card")!.schema.safeParse({ card: "1", destino: "APTOS CCS", desarquivar: true }).success).toBe(false);
    expect(getTool("arquivar_card")!.schema.safeParse({ card: "1", desarquivar: true }).success).toBe(true);
  });

  it("documentos: preparar_* sem permitir_vazios por padrão; anexar exige rascunho e pasta válida", () => {
    for (const name of ETAPA_4_L2) {
      const parsed = getTool(name)!.schema.safeParse({ card: "2342", modelo: "PEDIDO_HOSPITALAR" });
      expect(parsed.success && (parsed.data as { permitir_vazios: boolean }).permitir_vazios).toBe(false);
      expect(getTool(name)!.schema.safeParse({ card: "2342" }).success).toBe(false);
    }
    const anexar = getTool("anexar_rascunho")!;
    expect(anexar.schema.safeParse({}).success).toBe(false);
    expect(anexar.schema.safeParse({ rascunho: "op-drafts/abc12/1761350400000-0a1b2c3d.pdf", pasta: "XPTO" }).success).toBe(false);
    expect(anexar.schema.safeParse({ rascunho: "op-drafts/abc12/1761350400000-0a1b2c3d.pdf", pasta: "PROCURACAO" }).success).toBe(true);
    expect(getTool("listar_modelos")!.schema.safeParse({ tipo: "contrato" }).success).toBe(true);
    expect(getTool("listar_modelos")!.schema.safeParse({ tipo: "kit" }).success).toBe(false);
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

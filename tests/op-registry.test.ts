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
const ETAPA_5_L4 = ["preparar_email", "preparar_whatsapp", "executar_aprovado"];
// Etapa 6: registro de progresso (L1, escreve só em op_requests, nunca no card).
const ETAPA_6_L1 = ["salvar_progresso", "fluxos_abertos", "retomar_fluxo"];
// Etapa 7: auditoria e varredura (L1, só leitura).
const ETAPA_7_L1 = ["gerar_relatorio", "varrer_inconsistencias"];
const L3 = [...ETAPA_3, ...ETAPA_4_L3];

describe("registry da operação por IA", () => {
  it("Etapas 1–2 + meu_dia + 6 de escrita da Etapa 3 + documentos da Etapa 4 + envio aprovado da Etapa 5 + fluxos da Etapa 6, nomes únicos", () => {
    const names = OP_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(
      [...ETAPA_1, ...ETAPA_2, ...ETAPA_3_L1, ...ETAPA_3, ...ETAPA_4_L1, ...ETAPA_4_L2, ...ETAPA_4_L3, ...ETAPA_5_L4, ...ETAPA_6_L1, ...ETAPA_7_L1].sort(),
    );
  });

  it("consultar_hospital exige hospital ou card", () => {
    const t = getTool("consultar_hospital")!;
    expect(t.schema.safeParse({}).success).toBe(false);
    expect(t.schema.safeParse({ hospital: "angelina caron" }).success).toBe(true);
    expect(t.schema.safeParse({ card: "2342" }).success).toBe(true);
  });

  it("L4 só nas de envio aprovado; L3 só nas listas de escrita (op_write/archive_cards); L2 só nas preparar_* de documento; o resto é L1", () => {
    for (const t of OP_TOOLS) {
      expect(PERMISSION_KEYS).toContain(t.permission);
      expect(t.description.length).toBeGreaterThan(30);
      if (ETAPA_5_L4.includes(t.name)) {
        expect(t.level).toBe(4);
        expect(["op_approve", "view_whatsapp"]).toContain(t.permission);
        expect(t.description).toMatch(/^ENVIO\./);
      } else if (L3.includes(t.name)) {
        expect(t.level).toBe(3);
        expect(["op_write", "archive_cards"]).toContain(t.permission);
        expect(t.description).toMatch(/^ESCRITA\./);
      } else if (ETAPA_4_L2.includes(t.name)) {
        expect(t.level).toBe(2);
        expect(t.permission).toBe("op_use");
        expect(t.description).toMatch(/^PREPARA /);
      } else if (ETAPA_6_L1.includes(t.name)) {
        expect(t.level).toBe(1);
        expect(t.permission).toBe("op_use");
        expect(t.description).toMatch(/^REGISTRO\./);
      } else {
        expect(t.level).toBe(1);
        expect(t.switchable).toBeFalsy();
      }
    }
    expect(getTool("consultar_conversa")?.permission).toBe("view_whatsapp");
    expect(getTool("arquivar_card")?.permission).toBe("archive_cards");
  });

  it("nenhuma ferramenta de envio direto, lote ou mudança de etapa; executar só o aprovado", () => {
    for (const t of OP_TOOLS) expect(t.name).not.toMatch(/^(enviar|criar_card|mudar_etapa)/);
    expect(OP_TOOLS.filter((t) => t.name.startsWith("executar")).map((t) => t.name)).toEqual(["executar_aprovado"]);
    expect(getTool("preparar_whatsapp")?.permission).toBe("view_whatsapp");
  });

  it("fluxos (Etapa 6): só salvar_progresso tem interruptor; schemas", () => {
    expect(OP_TOOLS.filter((t) => t.switchable).map((t) => t.name)).toEqual(["salvar_progresso"]);
    const salvar = getTool("salvar_progresso")!.schema;
    expect(salvar.safeParse({ workflow: "prontuario", card: "2342", passo: "pedido", ref: "op-drafts/x/1792900329052-11fe030d.pdf" }).success).toBe(true);
    expect(salvar.safeParse({ workflow: "prontuario", card: "2342", passo: "anexar", ref: ["d1", "d2"] }).success).toBe(true);
    expect(salvar.safeParse({ workflow: "prontuario", card: "2342", fim: "abandonado" }).success).toBe(true);
    expect(salvar.safeParse({ workflow: "prontuario", card: "2342" }).success).toBe(false);
    expect(salvar.safeParse({ workflow: "prontuario", card: "2342", passo: "pedido", fim: "concluido" }).success).toBe(false);
    expect(salvar.safeParse({ workflow: "dpvat", card: "2342", passo: "pedido" }).success).toBe(false);
    expect(salvar.safeParse({ workflow: "prontuario", card: "2342", passo: "pendencias", bloqueio: { tipo: "dado_faltante", campos: ["data_acidente"] } }).success).toBe(true);
    expect(salvar.safeParse({ workflow: "prontuario", card: "2342", passo: "pendencias", bloqueio: { tipo: "outro" } }).success).toBe(false);
    const retomar = getTool("retomar_fluxo")!.schema;
    expect(retomar.safeParse({}).success).toBe(false);
    expect(retomar.safeParse({ card: "2342" }).success).toBe(false);
    expect(retomar.safeParse({ card: "2342", workflow: "prontuario" }).success).toBe(true);
    expect(retomar.safeParse({ fluxo: "cmreq00000000000000001" }).success).toBe(true);
    expect(getTool("fluxos_abertos")!.schema.safeParse({}).success).toBe(true);
  });

  it("Etapa 7: gerar_relatorio só gestor, tipos fechados, ≤ 90 dias; varredura com checagens e limite fechados", () => {
    const rel = getTool("gerar_relatorio")!;
    expect(rel.level).toBe(1);
    expect(rel.permission).toBe("manager_dashboard");
    expect(rel.switchable).toBeFalsy();
    expect(rel.schema.safeParse({ tipo: "operacao" }).success).toBe(true);
    expect(rel.schema.safeParse({ tipo: "operacao", dias: 90 }).success).toBe(true);
    expect(rel.schema.safeParse({ tipo: "operacao", dias: 91 }).success).toBe(false);
    expect(rel.schema.safeParse({ tipo: "prompts" }).success).toBe(false);
    expect(rel.schema.safeParse({ tipo: "falhas", de: "2026-10-01", ate: "2026-10-25" }).success).toBe(true);
    expect(rel.schema.safeParse({ tipo: "falhas", de: "01/10/2026" }).success).toBe(false);
    const props = (catalogEntry(rel).inputSchema as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props).sort()).toEqual(["ate", "de", "dias", "operador", "tipo"]);
    const v = getTool("varrer_inconsistencias")!;
    expect(v.level).toBe(1);
    expect(v.permission).toBe("op_use");
    const parsed = v.schema.safeParse({});
    expect(parsed.success && (parsed.data as { limite: number }).limite).toBe(30);
    expect(v.schema.safeParse({ limite: 51 }).success).toBe(false);
    expect(v.schema.safeParse({ checagens: ["cpf_repetido", "sem_hospital"] }).success).toBe(true);
    expect(v.schema.safeParse({ checagens: ["apagar_duplicados"] }).success).toBe(false);
    for (const name of ETAPA_7_L1) {
      const p = (catalogEntry(getTool(name)!).inputSchema as { properties: Record<string, unknown> }).properties;
      expect(p.confirmar).toBeUndefined();
    }
  });

  it("envio aprovado: schemas", () => {
    const email = getTool("preparar_email")!.schema;
    expect(email.safeParse({ card: "2342", assunto: "a", corpo: "b" }).success).toBe(true);
    expect(email.safeParse({ card: "2342", assunto: "a" }).success).toBe(false);
    expect(email.safeParse({ card: "2342", assunto: "a", corpo: "b", anexos: ["1", "2", "3", "4", "5", "6"] }).success).toBe(false);
    const wa = getTool("preparar_whatsapp")!.schema;
    expect(wa.safeParse({ card: "2342", texto: "oi" }).success).toBe(true);
    expect(wa.safeParse({ card: "2342", template: "aviso", variaveis: ["Ana"] }).success).toBe(true);
    expect(wa.safeParse({ card: "2342" }).success).toBe(false);
    expect(wa.safeParse({ card: "2342", texto: "oi", template: "aviso" }).success).toBe(false);
    const ex = getTool("executar_aprovado")!.schema;
    expect(ex.safeParse({ approvalId: "apr1", hash: "a".repeat(64) }).success).toBe(true);
    expect(ex.safeParse({ approvalId: "apr1", hash: "xyz" }).success).toBe(false);
    expect(ex.safeParse({ approvalId: "apr1" }).success).toBe(false);
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

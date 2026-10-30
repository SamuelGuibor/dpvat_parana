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
// Ajustes de 26/10 (09-decisoes-dono-26-10.md): escrita reversível (L3),
// irreversível com "aprovo <código>" (L4) e a leitura "quem pediu".
const AJUSTES_L3 = ["editar_cadastro", "gerenciar_documento", "editar_comentario", "atualizar_tarefa"];
const AJUSTES_L4 = ["preparar_acao_irreversivel"];
const AJUSTES_L1 = ["quem_pediu"];
// Decisão do dono (27/10): leitura dos documentos do card em lote com IA (L1, run_ai_audit).
// Item O (27/10): lote em segundo plano (op_jobs): iniciar_lote custa IA (interruptor), resultado_lote só lê.
const LOTE_L1 = ["analisar_documentos", "panorama_card", "iniciar_lote", "resultado_lote"];
// Cérebro APP (docs/ai-first/11-plano-cerebro-app.md): tickets + frente bot.
const CEREBRO_L1 = ["listar_tickets", "ler_ticket", "analisar_regra_bot"];
const CEREBRO_L3 = ["criar_ticket", "atualizar_ticket", "aplicar_regra_bot"];
// Decisão do dono (30/10): criar pela IA. Card e ticket DEV em L3; membro da
// equipe em L4 com "aprovo <código>" (dá acesso ao CRM).
const CRIACAO_L3 = ["criar_card", "criar_ticket_dev"];
const CRIACAO_L4 = ["preparar_membro_equipe"];
const L3 = [...ETAPA_3, ...ETAPA_4_L3, ...AJUSTES_L3];

describe("registry da operação por IA", () => {
  it("Etapas 1–2 + meu_dia + 6 de escrita da Etapa 3 + documentos da Etapa 4 + envio aprovado da Etapa 5 + fluxos da Etapa 6, nomes únicos", () => {
    const names = OP_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect([...names].sort()).toEqual(
      [...ETAPA_1, ...ETAPA_2, ...ETAPA_3_L1, ...ETAPA_3, ...ETAPA_4_L1, ...ETAPA_4_L2, ...ETAPA_4_L3, ...ETAPA_5_L4, ...ETAPA_6_L1, ...ETAPA_7_L1, ...AJUSTES_L3, ...AJUSTES_L4, ...AJUSTES_L1, ...LOTE_L1, ...CEREBRO_L1, ...CEREBRO_L3, ...CRIACAO_L3, ...CRIACAO_L4].sort(),
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
      } else if (AJUSTES_L4.includes(t.name) || CRIACAO_L4.includes(t.name)) {
        expect(t.level).toBe(4);
        expect(t.permission).toBe("op_approve");
        expect(t.description).toMatch(/^APROVAÇÃO\./);
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
      } else if (LOTE_L1.includes(t.name) || CEREBRO_L1.includes(t.name)) {
        expect(t.level).toBe(1);
      } else if (CEREBRO_L3.includes(t.name) || CRIACAO_L3.includes(t.name)) {
        expect(t.level).toBe(3);
        expect(t.description).toMatch(/^ESCRITA\./);
      } else {
        expect(t.level).toBe(1);
        expect(t.switchable).toBeFalsy();
      }
    }
    expect(getTool("consultar_conversa")?.permission).toBe("view_whatsapp");
    expect(getTool("arquivar_card")?.permission).toBe("archive_cards");
  });

  it("nenhuma ferramenta de envio direto, lote ou mudança de etapa; executar só o aprovado", () => {
    // criar_card foi liberada pelo dono em 30/10 (cria, não muda etapa nem envia).
    for (const t of OP_TOOLS) expect(t.name).not.toMatch(/^(enviar|mudar_etapa)/);
    expect(OP_TOOLS.filter((t) => t.name.startsWith("executar")).map((t) => t.name)).toEqual(["executar_aprovado"]);
    expect(getTool("preparar_whatsapp")?.permission).toBe("view_whatsapp");
  });

  it("fluxos (Etapa 6): só salvar_progresso tem interruptor; schemas", () => {
    // 27/10: analisar_documentos custa IA por chamada e também nasce desligada.
    expect(OP_TOOLS.filter((t) => t.switchable).map((t) => t.name).sort()).toEqual(["analisar_documentos", "analisar_regra_bot", "iniciar_lote", "salvar_progresso"]);
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

  it("Etapa 7: gerar_relatorio (op_use; equipe só para gestor, ver tests/op-metrics-lib), tipos fechados, ≤ 90 dias; varredura com checagens e limite fechados", () => {
    const rel = getTool("gerar_relatorio")!;
    expect(rel.level).toBe(1);
    expect(rel.permission).toBe("op_use");
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
    // Lote (27/10): e-mail por `lote` (um item por card), WhatsApp por `cards`; nunca os dois jeitos juntos.
    expect(email.safeParse({ lote: [{ card: "2342" }, { card: "2350", anexos: ["Pedido.pdf"], para: "x@h.com" }], assunto: "a", corpo: "Oi [[nome]]" }).success).toBe(true);
    expect(email.safeParse({ assunto: "a", corpo: "b" }).success).toBe(false);
    expect(email.safeParse({ card: "2342", lote: [{ card: "2350" }], assunto: "a", corpo: "b" }).success).toBe(false);
    expect(email.safeParse({ lote: [], assunto: "a", corpo: "b" }).success).toBe(false);
    const wa = getTool("preparar_whatsapp")!.schema;
    expect(wa.safeParse({ card: "2342", texto: "oi" }).success).toBe(true);
    expect(wa.safeParse({ card: "2342", template: "aviso", variaveis: ["Ana"] }).success).toBe(true);
    expect(wa.safeParse({ card: "2342" }).success).toBe(false);
    expect(wa.safeParse({ card: "2342", texto: "oi", template: "aviso" }).success).toBe(false);
    expect(wa.safeParse({ cards: ["2342", "2350"], texto: "Oi [[primeiro_nome]]" }).success).toBe(true);
    expect(wa.safeParse({ cards: ["2342"], template: "aviso", variaveis: ["[[nome]]"] }).success).toBe(true);
    expect(wa.safeParse({ card: "2342", cards: ["2350"], texto: "oi" }).success).toBe(false);
    expect(wa.safeParse({ texto: "oi" }).success).toBe(false);
    expect(wa.safeParse({ cards: Array.from({ length: 21 }, (_, i) => String(i + 1)), texto: "oi" }).success).toBe(false);
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
    // Lote (27/10): `rascunhos` em vez de `rascunho`, nunca os dois.
    expect(anexar.schema.safeParse({ rascunhos: ["op-drafts/abc12/1761350400000-0a1b2c3d.pdf", "op-drafts/abc12/1761350400001-0a1b2c3e.pdf"] }).success).toBe(true);
    expect(anexar.schema.safeParse({ rascunho: "op-drafts/abc12/1761350400000-0a1b2c3d.pdf", rascunhos: ["op-drafts/abc12/1761350400001-0a1b2c3e.pdf"] }).success).toBe(false);
    expect(anexar.schema.safeParse({ rascunhos: [] }).success).toBe(false);
    expect(getTool("listar_modelos")!.schema.safeParse({ tipo: "contrato" }).success).toBe(true);
    expect(getTool("listar_modelos")!.schema.safeParse({ tipo: "kit" }).success).toBe(false);
  });

  it("decisão 27/10: analisar_documentos é L1 com run_ai_audit (lê e compara, não altera), objetivo padrão cadastro", () => {
    const t = getTool("analisar_documentos")!;
    expect(t.level).toBe(1);
    expect(t.permission).toBe("run_ai_audit");
    expect(t.switchable).toBe(true);
    expect(getTool("panorama_card")!.switchable).toBeFalsy();
    const parsed = t.schema.safeParse({ card: "2342" });
    expect(parsed.success && (parsed.data as { objetivo: string }).objetivo).toBe("cadastro");
    expect(t.schema.safeParse({ card: "2342", pastas: ["IDENTIFICACAO", "OUTROS"], objetivo: "resumo" }).success).toBe(true);
    expect(t.schema.safeParse({ card: "2342", pastas: ["XPTO"] }).success).toBe(false);
    expect(t.schema.safeParse({ card: "2342", objetivo: "corrigir" }).success).toBe(false);
    expect(t.schema.safeParse({}).success).toBe(false);
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

  it("ajustes de 26/10: schemas de editar_cadastro, gerenciar_documento, ação irreversível e quem_pediu", () => {
    const cad = getTool("editar_cadastro")!.schema;
    expect(cad.safeParse({ card: "2342", campos: { cpf: "123" } }).success).toBe(true);
    expect(cad.safeParse({ card: "2342", campos: {} }).success).toBe(false);
    const doc = getTool("gerenciar_documento")!.schema;
    expect(doc.safeParse({ card: "2342", documento: "x", acao: "lixeira" }).success).toBe(true);
    expect(doc.safeParse({ card: "2342", documento: "x", acao: "renomear" }).success).toBe(false);
    expect(doc.safeParse({ card: "2342", documento: "x", acao: "mover_pasta", pasta: "PROCURAÇÃO" }).success).toBe(true);
    expect(doc.safeParse({ card: "2342", documento: "x", acao: "excluir" }).success).toBe(false);
    const irr = getTool("preparar_acao_irreversivel")!.schema;
    expect(irr.safeParse({ card: "2342", acao: "excluir_card" }).success).toBe(true);
    expect(irr.safeParse({ card: "2342", acao: "excluir_card", destino: "x" }).success).toBe(false);
    expect(irr.safeParse({ card: "2342", acao: "arquivar_definitivo" }).success).toBe(false);
    const qp = getTool("quem_pediu")!.schema;
    expect(qp.safeParse({ aprovacao: "K7QX" }).success).toBe(true);
    expect(qp.safeParse({}).success).toBe(false);
    expect(qp.safeParse({ aprovacao: "K7QX", card: "2342" }).success).toBe(false);
  });

  it("Cérebro APP: permissões e schemas das ferramentas de ticket e do bot", () => {
    expect(getTool("listar_tickets")?.permission).toBe("op_use");
    expect(getTool("ler_ticket")?.permission).toBe("op_use");
    expect(getTool("criar_ticket")?.permission).toBe("op_use");
    expect(getTool("atualizar_ticket")?.permission).toBe("manage_knowledge");
    expect(getTool("analisar_regra_bot")?.permission).toBe("teach_bot");
    expect(getTool("aplicar_regra_bot")?.permission).toBe("teach_bot");
    const criar = getTool("criar_ticket")!.schema;
    expect(criar.safeParse({ titulo: "Meu dia", destino: "skill", proposta: "mostrar tarefas primeiro" }).success).toBe(true);
    expect(criar.safeParse({ titulo: "Meu dia", destino: "codigo", proposta: "mostrar tarefas primeiro" }).success).toBe(false);
    const aplicar = getTool("aplicar_regra_bot")!.schema;
    expect(aplicar.safeParse({ modo: "reforcar", texto: "Pergunte o hospital antes.", regra: "R4", playbookVersao: 12, pedido: "x".repeat(10) }).success).toBe(true);
    expect(aplicar.safeParse({ modo: "apagar", texto: "Pergunte o hospital antes.", playbookVersao: 12, pedido: "x".repeat(10) }).success).toBe(false);
    expect(getTool("atualizar_ticket")!.schema.safeParse({ ticket: "S-K2P9X", registro: "feito", regra: "regra 4" }).success).toBe(false);
  });

  it("criação (30/10): card exige CPF e nome; ticket DEV só tipos manuais; membro só ADMIN/ADMIN+ e e-mail válido", () => {
    const card = getTool("criar_card")!.schema;
    expect(card.safeParse({ nome: "Ana Teste", cpf: "529.982.247-25" }).success).toBe(true);
    expect(card.safeParse({ nome: "Ana Teste" }).success).toBe(false);
    expect(card.safeParse({ nome: "Ana Teste", cpf: "52998224725", email: "nao-e-email" }).success).toBe(false);
    const parsed = card.safeParse({ nome: "Ana Teste", cpf: "52998224725" });
    expect(parsed.success && (parsed.data as { confirmar: boolean }).confirmar).toBe(false);
    const dev = getTool("criar_ticket_dev")!.schema;
    expect(dev.safeParse({ titulo: "Botão quebrado", tipo: "BUG", descricao: "Ao clicar em salvar no card 2342 nada acontece." }).success).toBe(true);
    expect(dev.safeParse({ titulo: "Hospital X", tipo: "CONHECIMENTO", descricao: "E-mail do hospital mudou para x@y." }).success).toBe(false);
    const membro = getTool("preparar_membro_equipe")!;
    expect(membro.level).toBe(4);
    expect(membro.schema.safeParse({ nome: "Bia", email: "bia@x.com", cpf: "52998224725", cargo: "ADMIN" }).success).toBe(true);
    expect(membro.schema.safeParse({ nome: "Bia", email: "bia@x.com", cpf: "52998224725", cargo: "ADMIN++" }).success).toBe(false);
    const props = (catalogEntry(membro).inputSchema as { properties: Record<string, unknown> }).properties;
    expect(props.senha).toBeUndefined();
    expect(props.password).toBeUndefined();
  });
});

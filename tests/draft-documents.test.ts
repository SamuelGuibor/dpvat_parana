import { describe, expect, it } from "vitest";
import { parseDraftDocuments, planDraftMigration } from "@/app/_shared/utils/draft-documents";

// Rascunho de documentos da ficha do WhatsApp → Document do card. O dedupe
// evita o mesmo arquivo duas vezes na aba Arquivos quando a conversa é
// vinculada ao card (vínculo por telefone, "Adicionar cliente" ou autocorreção).

describe("parseDraftDocuments", () => {
  it("devolve [] para null, objeto e JSON que não é lista", () => {
    expect(parseDraftDocuments(null)).toEqual([]);
    expect(parseDraftDocuments(undefined)).toEqual([]);
    expect(parseDraftDocuments({ key: "a" })).toEqual([]);
    expect(parseDraftDocuments("[]")).toEqual([]);
  });

  it("mantém key, nome e data; descarta item sem key", () => {
    const raw = [
      { key: "whatsapp/c1/docs/1700000000000-rg.pdf", name: "RG.pdf", uploadedAt: "2026-09-20T10:00:00.000Z" },
      { name: "sem key.pdf" },
      { key: "  " },
      null,
      "texto",
    ];
    expect(parseDraftDocuments(raw)).toEqual([
      { key: "whatsapp/c1/docs/1700000000000-rg.pdf", name: "RG.pdf", uploadedAt: "2026-09-20T10:00:00.000Z" },
    ]);
  });

  it("sem nome usa o nome do arquivo da key (sem o timestamp)", () => {
    expect(parseDraftDocuments([{ key: "whatsapp/c1/docs/1700000000000-comprovante.jpg" }])).toEqual([
      { key: "whatsapp/c1/docs/1700000000000-comprovante.jpg", name: "comprovante.jpg" },
    ]);
  });
});

describe("planDraftMigration", () => {
  const a = { key: "k/a.pdf", name: "a.pdf" };
  const b = { key: "k/b.pdf", name: "b.pdf" };
  const c = { key: "k/c.pdf", name: "c.pdf" };

  it("card sem nenhum dos arquivos: cria todos", () => {
    expect(planDraftMigration([a, b], [])).toEqual({ create: [a, b], restoreIds: [], alreadyInCard: 0 });
  });

  it("key já ativa no card não é recriada", () => {
    const plan = planDraftMigration([a, b], [{ id: "d1", key: "k/a.pdf", deletedAt: null }]);
    expect(plan).toEqual({ create: [b], restoreIds: [], alreadyInCard: 1 });
  });

  it("key só na lixeira é restaurada (a linha mais recente), não duplicada", () => {
    const plan = planDraftMigration([a, c], [
      { id: "old", key: "k/a.pdf", deletedAt: new Date("2026-09-01T00:00:00Z") },
      { id: "new", key: "k/a.pdf", deletedAt: new Date("2026-09-10T00:00:00Z") },
    ]);
    expect(plan).toEqual({ create: [c], restoreIds: ["new"], alreadyInCard: 0 });
  });

  it("linha ativa + linha na lixeira da mesma key: conta como já no card", () => {
    const plan = planDraftMigration([a], [
      { id: "lixo", key: "k/a.pdf", deletedAt: new Date("2026-09-10T00:00:00Z") },
      { id: "ativo", key: "k/a.pdf", deletedAt: null },
    ]);
    expect(plan).toEqual({ create: [], restoreIds: [], alreadyInCard: 1 });
  });

  it("mesma key repetida no rascunho vira um documento só", () => {
    const plan = planDraftMigration([a, { ...a, name: "a (2).pdf" }, b], []);
    expect(plan.create).toEqual([a, b]);
  });

  it("ignora documentos do card que não estão no rascunho", () => {
    const plan = planDraftMigration([b], [{ id: "d1", key: "k/a.pdf", deletedAt: null }]);
    expect(plan).toEqual({ create: [b], restoreIds: [], alreadyInCard: 0 });
  });
});

describe("pasta escolhida no rascunho (Anexar selecionadas sem card)", () => {
  it("mantém a pasta válida e descarta a inválida (a migração cai no inferCategory)", () => {
    expect(parseDraftDocuments([
      { key: "whatsapp/c1/1-midia.jpeg", name: "DOCUMENTO PESSOAL 1.jpeg", category: "IDENTIFICACAO" },
      { key: "whatsapp/c1/2-midia.jpeg", name: "Foto.jpeg", category: "PASTA_QUE_NAO_EXISTE" },
    ])).toEqual([
      { key: "whatsapp/c1/1-midia.jpeg", name: "DOCUMENTO PESSOAL 1.jpeg", category: "IDENTIFICACAO" },
      { key: "whatsapp/c1/2-midia.jpeg", name: "Foto.jpeg" },
    ]);
  });

  it("a pasta segue no plano de migração (vira a category do Document)", () => {
    const plan = planDraftMigration(
      [{ key: "k/rg.jpeg", name: "RG.jpeg", category: "IDENTIFICACAO" }],
      [],
    );
    expect(plan.create).toEqual([{ key: "k/rg.jpeg", name: "RG.jpeg", category: "IDENTIFICACAO" }]);
  });
});

import { describe, expect, it } from "vitest";
import {
  looksLikeRenamedContactKey,
  mediaRepairCsv,
  planMediaRepair,
  summarizeMediaRepair,
  type MediaRepairInput,
  type RepairDocument,
  type RepairMessage,
} from "@/app/_shared/utils/media-repair";

// Diagnóstico das mídias quebradas pelo rename antigo (copiava para
// `<pasta>/<Date.now()>-<nome>` e apagava a key da mensagem) e pela purga que
// apagava objeto ainda usado. O pareamento é heurístico: o teste trava o lado
// conservador (na dúvida, "ambiguo" e nenhuma ação).

const T = (min: number) => new Date(Date.UTC(2026, 8, 1, 12, min));
const TS = "1758800000000"; // 13 dígitos, como Date.now()

function msg(id: string, key: string, min: number, contactId = "c1"): RepairMessage {
  return { id, contactId, mediaKey: key, createdAt: T(min) };
}
function doc(id: string, key: string, min: number, extra: Partial<RepairDocument> = {}): RepairDocument {
  return { id, key, userId: "u1", createdAt: T(min), deletedAt: null, ...extra };
}
function input(p: Partial<MediaRepairInput> & { present: string[] }): MediaRepairInput {
  const present = new Set(p.present);
  return {
    exists: (k) => present.has(k),
    messages: p.messages ?? [],
    documents: p.documents ?? [],
    library: p.library ?? [],
    versions: p.versions,
    evidence: p.evidence,
    includeOrderPairs: p.includeOrderPairs ?? false,
    canRestoreVersion: p.canRestoreVersion ?? false,
  };
}

describe("looksLikeRenamedContactKey", () => {
  it("reconhece <ts 13 dígitos>-<nome> na pasta do contato", () => {
    expect(looksLikeRenamedContactKey(`whatsapp/c1/${TS}-RG_frente.jpeg`)).toBe(true);
  });
  it("rascunho da ficha, assinatura, envio do atendente e biblioteca ficam de fora", () => {
    expect(looksLikeRenamedContactKey(`whatsapp/c1/docs/${TS}-rg.pdf`)).toBe(false);
    expect(looksLikeRenamedContactKey(`whatsapp/c1/assinado-kit-${TS}.pdf`)).toBe(false);
    expect(looksLikeRenamedContactKey(`whatsapp/c1/out-${TS}-foto.jpg`)).toBe(false);
    expect(looksLikeRenamedContactKey(`whatsapp/flows/${TS}-video.mp4`)).toBe(false);
    expect(looksLikeRenamedContactKey(`uploads/user_x/${TS}-a.pdf`)).toBe(false);
  });
});

describe("planMediaRepair", () => {
  it("1 mensagem quebrada ↔ 1 cópia renomeada no mesmo contato e extensão = apontar_para_doc (alta)", () => {
    const old = `whatsapp/c1/1758700000000-midia.jpeg`;
    const renamed = `whatsapp/c1/${TS}-RG.jpeg`;
    const rows = planMediaRepair(
      input({ present: [renamed], messages: [msg("m1", old, 0)], documents: [doc("d1", renamed, 5)] }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      origem: "mensagem",
      id: "m1",
      contactId: "c1",
      categoria: "rename_pareavel",
      acao: "apontar_para_doc",
      newKey: renamed,
      docId: "d1",
      confianca: "alta",
      aplica: true,
    });
  });

  it("extensão ignora maiúsculas, mas extensão diferente não pareia", () => {
    const rows = planMediaRepair(
      input({
        present: [`whatsapp/c1/${TS}-RG.JPEG`, `whatsapp/c1/${TS}-laudo.pdf`],
        messages: [msg("m1", "whatsapp/c1/1-a.jpeg", 0), msg("m2", "whatsapp/c1/2-b.png", 0)],
        documents: [doc("d1", `whatsapp/c1/${TS}-RG.JPEG`, 1), doc("d2", `whatsapp/c1/${TS}-laudo.pdf`, 1)],
      }),
    );
    expect(rows.find((r) => r.id === "m1")).toMatchObject({ acao: "apontar_para_doc", docId: "d1" });
    // .png sem cópia .png no contato e sem Document com a key = purgado.
    expect(rows.find((r) => r.id === "m2")).toMatchObject({ categoria: "purgado", acao: "nenhuma", aplica: false });
  });

  it("cópia de outro contato não pareia", () => {
    const rows = planMediaRepair(
      input({
        present: [`whatsapp/c2/${TS}-RG.jpeg`],
        messages: [msg("m1", "whatsapp/c1/1-a.jpeg", 0)],
        documents: [doc("d1", `whatsapp/c2/${TS}-RG.jpeg`, 5)],
      }),
    );
    expect(rows[0]).toMatchObject({ categoria: "purgado", acao: "nenhuma" });
  });

  it("anexo mais velho que a mensagem derruba o par (ambiguo)", () => {
    const rows = planMediaRepair(
      input({
        present: [`whatsapp/c1/${TS}-RG.jpeg`],
        messages: [msg("m1", "whatsapp/c1/1-a.jpeg", 10)],
        documents: [doc("d1", `whatsapp/c1/${TS}-RG.jpeg`, 5)],
      }),
    );
    expect(rows[0]).toMatchObject({ categoria: "ambiguo", acao: "nenhuma", aplica: false });
  });

  it("n↔n pareia por ordem de data, e só aplica com --incluir-ordem", () => {
    const base = {
      present: [`whatsapp/c1/${TS}-b.jpeg`, `whatsapp/c1/${TS}-a.jpeg`],
      messages: [msg("m2", "whatsapp/c1/2-y.jpeg", 2), msg("m1", "whatsapp/c1/1-x.jpeg", 1)],
      documents: [doc("dB", `whatsapp/c1/${TS}-b.jpeg`, 8), doc("dA", `whatsapp/c1/${TS}-a.jpeg`, 7)],
    };
    const rows = planMediaRepair(input(base));
    expect(rows.find((r) => r.id === "m1")).toMatchObject({ acao: "par_por_ordem", docId: "dA", confianca: "media", aplica: false });
    expect(rows.find((r) => r.id === "m2")).toMatchObject({ acao: "par_por_ordem", docId: "dB", aplica: false });
    const withOrder = planMediaRepair(input({ ...base, includeOrderPairs: true }));
    expect(withOrder.every((r) => r.aplica)).toBe(true);
  });

  it("contagens diferentes no grupo = ambiguo", () => {
    const rows = planMediaRepair(
      input({
        present: [`whatsapp/c1/${TS}-a.jpeg`, `whatsapp/c1/${TS}-b.jpeg`],
        messages: [msg("m1", "whatsapp/c1/1-x.jpeg", 1)],
        documents: [doc("dA", `whatsapp/c1/${TS}-a.jpeg`, 7), doc("dB", `whatsapp/c1/${TS}-b.jpeg`, 8)],
      }),
    );
    expect(rows[0]).toMatchObject({ categoria: "ambiguo", acao: "nenhuma" });
  });

  it("várias mensagens com a mesma key contam como uma só no pareamento", () => {
    const old = "whatsapp/c1/1-x.jpeg";
    const rows = planMediaRepair(
      input({
        present: [`whatsapp/c1/${TS}-a.jpeg`],
        messages: [msg("m1", old, 1), msg("m1b", old, 3)],
        documents: [doc("dA", `whatsapp/c1/${TS}-a.jpeg`, 7)],
      }),
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.acao === "apontar_para_doc" && r.docId === "dA")).toBe(true);
  });

  it("Document referenciado por mensagem ou que também sumiu não é candidato", () => {
    const rows = planMediaRepair(
      input({
        present: [`whatsapp/c1/${TS}-recebida.jpeg`],
        messages: [msg("m1", "whatsapp/c1/1-x.jpeg", 1), msg("m9", `whatsapp/c1/${TS}-recebida.jpeg`, 0)],
        documents: [
          doc("dRef", `whatsapp/c1/${TS}-recebida.jpeg`, 7),
          doc("dSumiu", "whatsapp/c1/1758800000001-copia.jpeg", 7, { deletedAt: T(20) }),
        ],
      }),
    );
    const m1 = rows.find((r) => r.id === "m1");
    expect(m1).toMatchObject({ acao: "nenhuma" });
    // O Document da lixeira sem objeto vira linha própria, só relatório.
    expect(rows.find((r) => r.id === "dSumiu")).toMatchObject({ categoria: "doc_quebrado_lixeira", acao: "nenhuma" });
  });

  it("cópia renomeada que está na lixeira ainda serve de par", () => {
    const rows = planMediaRepair(
      input({
        present: [`whatsapp/c1/${TS}-a.jpeg`],
        messages: [msg("m1", "whatsapp/c1/1-x.jpeg", 1)],
        documents: [doc("dA", `whatsapp/c1/${TS}-a.jpeg`, 7, { deletedAt: T(30) })],
      }),
    );
    expect(rows[0]).toMatchObject({ acao: "apontar_para_doc", docId: "dA" });
  });

  it("Document reanexado com a key antiga vira soft_delete_doc quando a cópia renomeada está ativa no mesmo card", () => {
    const old = "whatsapp/c1/1-x.jpeg";
    const renamed = `whatsapp/c1/${TS}-RG.jpeg`;
    const rows = planMediaRepair(
      input({
        present: [renamed],
        messages: [msg("m1", old, 1)],
        documents: [doc("dRen", renamed, 5), doc("dReanexo", old, 40)],
      }),
    );
    expect(rows.find((r) => r.id === "m1")).toMatchObject({ categoria: "rename_pareavel", acao: "apontar_para_doc" });
    expect(rows.find((r) => r.id === "dReanexo")).toMatchObject({
      origem: "documento",
      categoria: "doc_quebrado",
      acao: "soft_delete_doc",
      newKey: renamed,
      docId: "dRen",
      aplica: true,
    });
  });

  it("reanexado em outro card, ou com a cópia na lixeira, fica só no relatório", () => {
    const old = "whatsapp/c1/1-x.jpeg";
    const renamed = `whatsapp/c1/${TS}-RG.jpeg`;
    const outroCard = planMediaRepair(
      input({
        present: [renamed],
        messages: [msg("m1", old, 1)],
        documents: [doc("dRen", renamed, 5), doc("dReanexo", old, 40, { userId: "u2" })],
      }),
    );
    expect(outroCard.find((r) => r.id === "dReanexo")).toMatchObject({ categoria: "doc_quebrado", acao: "nenhuma" });
    const copiaNaLixeira = planMediaRepair(
      input({
        present: [renamed],
        messages: [msg("m1", old, 1)],
        documents: [doc("dRen", renamed, 5, { deletedAt: T(50) }), doc("dReanexo", old, 40)],
      }),
    );
    expect(copiaNaLixeira.find((r) => r.id === "dReanexo")).toMatchObject({ acao: "nenhuma" });
  });

  it("mensagem sem cópia mas com Document ainda apontando para a key = ambiguo; com log de purga = purgado", () => {
    const old = "whatsapp/c1/1-x.jpeg";
    const semLog = planMediaRepair(
      input({ present: [], messages: [msg("m1", old, 1)], documents: [doc("d1", old, 5)] }),
    );
    expect(semLog.find((r) => r.id === "m1")).toMatchObject({ categoria: "ambiguo" });
    expect(semLog.find((r) => r.id === "d1")).toMatchObject({ categoria: "doc_quebrado", acao: "nenhuma" });
    const comLog = planMediaRepair(
      input({
        present: [],
        messages: [msg("m1", old, 1)],
        documents: [doc("d1", old, 5)],
        evidence: new Map([[old, "document_purge"]]),
      }),
    );
    expect(comLog.find((r) => r.id === "m1")).toMatchObject({ categoria: "purgado", evidencia: "document_purge" });
  });

  it("bucket versionado: restaurar_versao vence o pareamento e só aplica com s3:GetObjectVersion", () => {
    const old = "whatsapp/c1/1-x.jpeg";
    const renamed = `whatsapp/c1/${TS}-RG.jpeg`;
    const base = {
      present: [renamed],
      messages: [msg("m1", old, 1)],
      documents: [doc("dRen", renamed, 5), doc("dReanexo", old, 40)],
      versions: new Map([[old, "v123"]]),
    };
    const semPermissao = planMediaRepair(input(base));
    expect(semPermissao.find((r) => r.id === "m1")).toMatchObject({
      categoria: "rename_pareavel",
      acao: "restaurar_versao",
      versionId: "v123",
      confianca: "alta",
      aplica: false,
    });
    const comPermissao = planMediaRepair(input({ ...base, canRestoreVersion: true }));
    expect(comPermissao.find((r) => r.id === "m1")).toMatchObject({ acao: "restaurar_versao", aplica: true });
    // A versão restaurada conserta também o Document reanexado.
    expect(comPermissao.find((r) => r.id === "dReanexo")).toMatchObject({ acao: "restaurar_versao", aplica: true });
  });

  it("fluxo/template com mídia sumida = biblioteca (reenviar pela tela); as mensagens do fluxo também", () => {
    const flowKey = `whatsapp/flows/${TS}-boas-vindas.mp4`;
    const rows = planMediaRepair(
      input({
        present: [],
        messages: [msg("m1", flowKey, 1)],
        library: [
          { origin: "fluxo", id: "f1", key: flowKey },
          { origin: "template", id: "t1", key: "whatsapp/templates/1-cab.jpg" },
        ],
      }),
    );
    expect(rows.find((r) => r.id === "f1")).toMatchObject({ origem: "fluxo", categoria: "biblioteca", acao: "reenviar_pela_tela", contactId: "" });
    expect(rows.find((r) => r.id === "t1")).toMatchObject({ origem: "template", categoria: "biblioteca" });
    expect(rows.find((r) => r.id === "m1")).toMatchObject({ categoria: "biblioteca", acao: "nenhuma" });
  });

  it("Document em whatsapp/flows/ sem mensagem nem fluxo usando = fluxo_renomeado (só relatório)", () => {
    const usada = `whatsapp/flows/${TS}-usada.mp4`;
    const copia = "whatsapp/flows/1758800000002-renomeado.mp4";
    const rows = planMediaRepair(
      input({
        present: [usada, copia],
        library: [{ origin: "fluxo", id: "f1", key: usada }],
        documents: [doc("dUsada", usada, 1), doc("dCopia", copia, 1)],
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "dCopia", categoria: "fluxo_renomeado", acao: "nenhuma", aplica: false });
  });

  it("nada quebrado = nenhuma linha", () => {
    const k = "whatsapp/c1/1-x.jpeg";
    expect(planMediaRepair(input({ present: [k], messages: [msg("m1", k, 1)], documents: [doc("d1", k, 2)] }))).toEqual([]);
  });
});

describe("summarizeMediaRepair e mediaRepairCsv", () => {
  const old = "whatsapp/c1/1-x.jpeg";
  const renamed = `whatsapp/c1/${TS}-RG, "frente";.jpeg`;
  const rows = planMediaRepair(
    input({
      present: [renamed],
      messages: [msg("m1", old, 1), msg("m2", "whatsapp/c2/2-y.pdf", 1, "c2")],
      documents: [doc("dRen", renamed, 5), doc("dReanexo", old, 40)],
    }),
  );

  it("conta por categoria, ação, keys e contatos", () => {
    const s = summarizeMediaRepair(rows);
    expect(s.porCategoria).toEqual({ rename_pareavel: 1, purgado: 1, doc_quebrado: 1 });
    expect(s.porAcao).toEqual({ apontar_para_doc: 1, nenhuma: 1, soft_delete_doc: 1 });
    expect(s).toMatchObject({ aplicaveis: 2, keysSumidas: 2, contatos: 2, mensagens: 2 });
  });

  it("CSV com cabeçalho, tudo entre aspas e aspas internas dobradas", () => {
    const csv = mediaRepairCsv(rows);
    const lines = csv.trimEnd().split("\n");
    expect(lines[0]).toBe(
      '"origem","id","contactId","categoria","acao","confianca","aplica","oldKey","newKey","versionId","docId","evidencia"',
    );
    expect(lines).toHaveLength(4);
    expect(csv).toContain('"whatsapp/c1/1758800000000-RG, ""frente"";.jpeg"');
    expect(lines[1]).toContain('"sim"');
  });
});

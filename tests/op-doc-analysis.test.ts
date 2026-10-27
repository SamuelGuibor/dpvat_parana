import { describe, it, expect, vi, beforeEach } from "vitest";

// Tudo mockado: banco, S3 e Claude. Nada é lido de produção nem pago.
const db = vi.hoisted(() => ({ user: { findUnique: vi.fn() }, document: { findMany: vi.fn() } }));
vi.mock("@/app/_shared/lib/prisma", () => ({ db }));
const ai = vi.hoisted(() => ({ call: vi.fn(), fetch: vi.fn() }));
vi.mock("@/app/_shared/lib/ai-audit", () => ({
  callClaude: (...a: unknown[]) => ai.call(...a),
  fetchS3Buffer: (...a: unknown[]) => ai.fetch(...a),
  mediaKind: (name: string) => (name.endsWith(".pdf") ? { kind: "pdf" } : /\.(jpe?g|png)$/i.test(name) ? { kind: "image", mediaType: "image/jpeg" } : null),
  MAX_FILES: 2,
  MAX_FILE_BYTES: 8 * 1024 * 1024,
  MAX_TOTAL_BYTES: 24 * 1024 * 1024,
}));
const logs = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@/app/_shared/lib/log", () => ({ createLog: (...a: unknown[]) => logs.create(...a) }));

import { analyzeCardDocuments } from "@/app/_shared/lib/op/doc-analysis";

const author = { id: "op1", name: "Ana (via IA)" };
const trace = { sessionId: "s1", requestId: "r1" };
const usage = { model: "claude-sonnet-5", inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 };

beforeEach(() => {
  db.user.findUnique.mockReset().mockResolvedValue({ cardNumber: 2342, name: "Ana Souza", cpf: "52998224752", rg: null, data_nasc: null, nome_mae: null, nacionalidade: null, estado_civil: null, profissao: null, rua: null, numero: null, bairro: null, cidade: null, estado: null, cep: null });
  db.document.findMany.mockReset().mockResolvedValue([
    { id: "d1", key: "uploads/u/rg.jpg", name: "rg.jpg", category: "IDENTIFICACAO" },
    { id: "d2", key: "uploads/u/laudo.pdf", name: "laudo.pdf", category: "EXAME_MEDICO" },
    { id: "d3", key: "uploads/u/planilha.xlsx", name: "planilha.xlsx", category: "IDENTIFICACAO" },
  ]);
  ai.fetch.mockReset().mockResolvedValue(Buffer.from([1, 2, 3]));
  ai.call.mockReset().mockResolvedValue({
    result: { documentos: [{ arquivo: "rg.jpg", tipo: "RG", legivel: true, nome: "Ana Souza", cpf: "529.982.247-25", rg: "12.345.678-9" }], resumo: "RG legível." },
    usage,
  });
  logs.create.mockReset();
});

describe("analisar documentos do card (lote por pasta)", () => {
  it("cadastro: lê só IDENTIFICACAO (formato não lido vai para naoAnalisados), compara e grava o log com usage", async () => {
    const r = await analyzeCardDocuments({ cardId: "c1", objetivo: "cadastro", author, trace });
    expect(r.arquivosAnalisados).toEqual(["rg.jpg"]);
    expect(r.naoAnalisados).toEqual([{ arquivo: "planilha.xlsx", motivo: expect.stringContaining("formato") }]);
    expect(ai.fetch).toHaveBeenCalledTimes(1);
    const content = ai.call.mock.calls[0][0] as { type: string; text?: string }[];
    expect(content[0]).toEqual({ type: "text", text: 'Arquivo: "rg.jpg"' });
    expect(content[1].type).toBe("image");
    expect(content.at(-1)?.text).toMatch(/SÓ com JSON/);
    expect(r.comparacao?.trocar).toEqual({ cpf: "52998224725" });
    expect(r.comparacao?.preencher).toEqual({ rg: "12.345.678-9" });
    expect(r.comparacao?.divergencias[0]).toMatchObject({ campo: "cpf", noCard: "52998224752", noDocumento: "52998224725", fonte: "rg.jpg" });
    expect(r.modelo).toBe("claude-sonnet-5");
    expect(logs.create.mock.calls[0][0]).toMatchObject({ action: "op_doc_analysis", userId: "c1", authorId: "op1", metadata: { source: "op", op: trace, usage, files: ["rg.jpg"], divergencias: ["cpf"] } });
  });

  it("resumo: todas as pastas, teto de arquivos respeitado, sem comparação", async () => {
    ai.call.mockResolvedValue({ result: { documentos: [{ arquivo: "rg.jpg", tipo: "RG", descricao: "RG", datas: [], legivel: true }], resumo: "ok" }, usage });
    const r = await analyzeCardDocuments({ cardId: "c1", objetivo: "resumo", author, trace });
    expect(r.arquivosAnalisados).toEqual(["rg.jpg", "laudo.pdf"]);
    expect(r.naoAnalisados.map((n) => n.arquivo)).toEqual(["planilha.xlsx"]);
    expect(r.comparacao).toBeUndefined();
    expect(r.resumo).toBe("ok");
  });

  it("documento pedido que não existe → nao_encontrado; pasta vazia → sem_documentos; card sumiu → nao_encontrado", async () => {
    await expect(analyzeCardDocuments({ cardId: "c1", objetivo: "cadastro", documentos: ["rg.jpg", "x.pdf"], author, trace })).rejects.toMatchObject({ code: "nao_encontrado", details: ["x.pdf"] });
    await expect(analyzeCardDocuments({ cardId: "c1", objetivo: "cadastro", pastas: ["ROTEIRO"], author, trace })).rejects.toMatchObject({ code: "sem_documentos" });
    db.user.findUnique.mockResolvedValue(null);
    await expect(analyzeCardDocuments({ cardId: "c1", objetivo: "cadastro", author, trace })).rejects.toMatchObject({ code: "nao_encontrado" });
    expect(ai.call).not.toHaveBeenCalled();
    expect(logs.create).not.toHaveBeenCalled();
  });

  it("IA recusa ou devolve JSON cortado → ia_falhou, mas os tokens pagos entram no log", async () => {
    ai.call.mockRejectedValue(Object.assign(new Error("Resposta da IA sem JSON"), { usage }));
    await expect(analyzeCardDocuments({ cardId: "c1", objetivo: "cadastro", author, trace })).rejects.toMatchObject({ code: "ia_falhou", status: 502 });
    expect(ai.call.mock.calls[0][1]).toEqual({ timeoutMs: 45_000 });
    expect(logs.create.mock.calls[0][0]).toMatchObject({ action: "op_doc_analysis", metadata: { usage, erro: "Resposta da IA sem JSON", files: ["rg.jpg"] } });
  });

  it("arquivo ilegível no S3 vai para naoAnalisados; nenhum legível → sem_documentos sem pagar IA", async () => {
    ai.fetch.mockRejectedValue(new Error("s3"));
    await expect(analyzeCardDocuments({ cardId: "c1", objetivo: "cadastro", author, trace })).rejects.toMatchObject({ code: "sem_documentos" });
    expect(ai.call).not.toHaveBeenCalled();
  });
});

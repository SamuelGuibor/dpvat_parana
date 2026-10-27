import { beforeEach, describe, expect, it, vi } from "vitest";

// Item O (27/10): fila op_jobs — criar (dedupe/pulados), claim atômico,
// processar item a item dentro do orçamento, leitura só do próprio operador.

const db = vi.hoisted(() => ({
  opJob: { create: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
}));
const cards = vi.hoisted(() => ({ map: {} as Record<string, string> }));
const analysis = vi.hoisted(() => ({ run: vi.fn() }));
const switches = vi.hoisted(() => ({ value: { analisar_documentos: true } as Record<string, boolean> }));

vi.mock("@/app/_shared/lib/prisma", () => ({ db }));
vi.mock("@/app/_shared/lib/op/cards", async () => {
  const { OpToolError } = await import("@/app/_shared/lib/op/registry");
  return {
    resolveOneCardId: vi.fn(async (ref: string) => {
      const id = cards.map[ref];
      if (!id) throw new OpToolError("nao_encontrado", "card não encontrado", 404);
      return id;
    }),
  };
});
vi.mock("@/app/_shared/lib/op/doc-analysis", () => ({ analyzeCardDocuments: analysis.run }));
vi.mock("@/app/_shared/lib/op/switches", () => ({ getOpSwitches: vi.fn(async () => switches.value) }));

import { claimJob, createJob, loadJobFor, runJob, runJobsTick, type JobRow } from "@/app/_shared/lib/op/jobs";

const autor = { id: "op1", name: "Ana (via IA)" };
function row(over: Partial<JobRow> = {}): JobRow {
  return {
    id: "job1",
    tipo: "analisar_documentos",
    operatorId: "op1",
    sessionId: "s1",
    args: { objetivo: "cadastro", autor },
    itens: [
      { card: "2342", cardId: "c1", status: "pendente" },
      { card: "2350", cardId: "c2", status: "pendente" },
    ],
    total: 2,
    feitos: 0,
    status: "rodando",
    claimedAt: new Date(),
    startedAt: new Date(),
    finishedAt: null,
    vistoEm: null,
    erro: null,
    createdAt: new Date("2026-10-27T12:00:00Z"),
    updatedAt: new Date("2026-10-27T12:00:00Z"),
    ...over,
  } as JobRow;
}

beforeEach(() => {
  vi.clearAllMocks();
  cards.map = { "2342": "c1", "#2342": "c1", "2350": "c2" };
  switches.value = { analisar_documentos: true };
  db.opJob.create.mockResolvedValue({ id: "job1" });
  db.opJob.update.mockResolvedValue({});
  db.opJob.updateMany.mockResolvedValue({ count: 1 });
  analysis.run.mockImplementation(async ({ cardId }: { cardId: string }) => ({
    card: { cardNumber: cardId === "c1" ? 2342 : 2350, nome: "X" },
    objetivo: "cadastro",
    arquivosAnalisados: ["rg.jpg"],
    naoAnalisados: [],
    documentos: [],
    resumo: null,
    comparacao: { divergencias: [{ campo: "cpf" }], preencher: {}, trocar: { cpf: "52998224725" }, iguais: [], sugestoes: { cpf: "52998224725" } },
    modelo: "m",
  }));
});

describe("createJob", () => {
  it("dedupe por referência e por card; não encontrado vira pulado; grava pendente com os itens", async () => {
    const r = await createJob({ operatorId: "op1", sessionId: "s1", tipo: "analisar_documentos", cards: ["2342", "#2342", "2350", "9999"], args: { objetivo: "cadastro", autor } });
    expect(r).toMatchObject({ jobId: "job1", total: 2, pulados: [{ card: "9999", code: "nao_encontrado" }] });
    const data = db.opJob.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tipo: "analisar_documentos", operatorId: "op1", total: 2 });
    expect(data.itens).toEqual([
      { card: "2342", cardId: "c1", status: "pendente" },
      { card: "2350", cardId: "c2", status: "pendente" },
    ]);
  });

  it("nenhum card válido → lote_vazio; mais de 50 → argumentos_invalidos", async () => {
    await expect(createJob({ operatorId: "op1", sessionId: null, tipo: "analisar_documentos", cards: ["9999"], args: { autor } })).rejects.toMatchObject({ code: "lote_vazio" });
    await expect(createJob({ operatorId: "op1", sessionId: null, tipo: "analisar_documentos", cards: Array.from({ length: 51 }, (_, i) => String(i)), args: { autor } })).rejects.toMatchObject({ code: "argumentos_invalidos" });
    expect(db.opJob.create).not.toHaveBeenCalled();
  });
});

describe("claimJob", () => {
  it("claim atômico: só leva se o updateMany acertou a linha; perdeu a corrida → tenta o próximo", async () => {
    db.opJob.findFirst.mockResolvedValueOnce({ id: "a", status: "pendente", claimedAt: null }).mockResolvedValueOnce({ id: "b", status: "pendente", claimedAt: null });
    db.opJob.updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    db.opJob.findUnique.mockResolvedValue(row({ id: "b" }));
    const j = await claimJob(new Date("2026-10-27T12:00:00Z"));
    expect(j?.id).toBe("b");
    expect(db.opJob.updateMany.mock.calls[1][0]).toMatchObject({ where: { id: "b", status: "pendente", claimedAt: null }, data: { status: "rodando" } });
  });

  it("job rodando há mais de 10 min (função morreu) pode ser reivindicado; nada pendente → null", async () => {
    db.opJob.findFirst.mockResolvedValueOnce(null);
    expect(await claimJob()).toBeNull();
    const where = db.opJob.findFirst.mock.calls[0][0].where;
    expect(where.OR[1]).toMatchObject({ status: "rodando", claimedAt: { lt: expect.any(Date) } });
  });
});

describe("runJob", () => {
  it("processa item a item, grava a cada item com usage pela lib de análise, termina concluido", async () => {
    const r = await runJob(row(), 240_000);
    expect(r).toEqual({ feitos: 2, terminou: true });
    expect(analysis.run).toHaveBeenCalledTimes(2);
    expect(analysis.run.mock.calls[0][0]).toMatchObject({ cardId: "c1", objetivo: "cadastro", author: autor, trace: { sessionId: "s1", requestId: null } });
    // 2 gravações de item + 1 de fechamento
    expect(db.opJob.updateMany).toHaveBeenCalledTimes(3);
    expect(db.opJob.updateMany.mock.calls[0][0].where).toEqual({ id: "job1", status: "rodando" });
    const itens = db.opJob.updateMany.mock.calls[1][0].data.itens;
    expect(itens[0]).toMatchObject({ status: "concluido", cardNumber: 2342, resumo: "1 doc(s), 1 divergência(s)", data: { sugestoes: { cpf: "52998224725" } } });
    expect(db.opJob.updateMany.mock.calls[2][0].data).toMatchObject({ status: "concluido", claimedAt: null });
  });

  it("falha de um item não derruba o lote; interruptor desligado marca ferramenta_desligada", async () => {
    analysis.run.mockRejectedValueOnce(Object.assign(new Error("IA caiu"), { code: "ia_falhou" }));
    const r = await runJob(row(), 240_000);
    expect(r.terminou).toBe(true);
    const itens = db.opJob.updateMany.mock.calls[2][0].data.itens ?? db.opJob.updateMany.mock.calls[1][0].data.itens;
    expect(itens[0]).toMatchObject({ status: "falhou" });
    expect(itens[1]).toMatchObject({ status: "concluido" });

    vi.clearAllMocks();
    db.opJob.updateMany.mockResolvedValue({ count: 1 });
    switches.value = { analisar_documentos: false };
    await runJob(row(), 240_000);
    expect(analysis.run).not.toHaveBeenCalled();
    expect(db.opJob.updateMany.mock.calls.at(-1)![0].data).toMatchObject({ status: "falhou" });
  });

  it("outro tique reivindicou o job como perdido (updateMany não acerta) → este para sem sobrescrever", async () => {
    db.opJob.updateMany.mockResolvedValue({ count: 0 });
    const r = await runJob(row(), 240_000);
    expect(r).toEqual({ feitos: 1, terminou: false });
    expect(analysis.run).toHaveBeenCalledTimes(1);
  });

  it("orçamento esgotado → para e devolve o job a pendente para o próximo tique", async () => {
    const r = await runJob(row(), 10_000, Date.now());
    expect(r).toEqual({ feitos: 0, terminou: false });
    expect(analysis.run).not.toHaveBeenCalled();
    expect(db.opJob.updateMany.mock.calls.at(-1)![0].data).toMatchObject({ status: "pendente", claimedAt: null });
  });
});

describe("runJobsTick", () => {
  it("reivindica jobs até acabar a fila", async () => {
    db.opJob.findFirst.mockResolvedValueOnce({ id: "job1", status: "pendente", claimedAt: null }).mockResolvedValueOnce(null);
    db.opJob.updateMany.mockResolvedValue({ count: 1 });
    db.opJob.findUnique.mockResolvedValue(row());
    expect(await runJobsTick(240_000)).toEqual({ jobs: 1, itens: 2, terminados: 1 });
  });
});

describe("loadJobFor", () => {
  it("só o próprio operador lê; terminado é marcado como visto", async () => {
    db.opJob.findUnique.mockResolvedValue(row({ status: "concluido", finishedAt: new Date() }));
    await expect(loadJobFor("job1", "op2")).rejects.toMatchObject({ code: "nao_encontrado" });
    await loadJobFor("job1", "op1");
    expect(db.opJob.update).toHaveBeenCalledWith({ where: { id: "job1" }, data: { vistoEm: expect.any(Date) } });
  });
});

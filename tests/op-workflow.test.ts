import { describe, it, expect, vi, beforeEach } from "vitest";

// Prisma, S3 (getDraft) e resolução de card mockados: o teste nunca toca produção.
const db = vi.hoisted(() => {
  const m = {
    opWorkflow: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    opApproval: { findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    document: { findMany: vi.fn() },
    comment: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  return m;
});
vi.mock("@/app/_shared/lib/prisma", () => ({ db }));

const drafts = vi.hoisted(() => {
  class DraftError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  }
  return { getDraft: vi.fn(), DraftError };
});
vi.mock("@/app/_shared/lib/docs/drafts", () => drafts);

vi.mock("@/app/_shared/lib/op/cards", () => ({
  CARD_WHERE: { role: { notIn: ["ADMIN", "GHOST"] } },
  resolveOneCardId: vi.fn(async (ref: string) => (ref === "4967" ? CARD_ID : "outro")),
}));

import { loadForResume, saveProgress } from "@/app/_shared/lib/op/workflow";
import { markDone, newState, type WorkflowState } from "@/app/_shared/utils/workflows";
import type { OperatorContext } from "@/app/_shared/lib/op/auth";

const CARD_ID = "cmsp9hqlk0001l904y4fyvnku";
const KEY = `op-drafts/${CARD_ID}/1792900329052-11fe030d.pdf`;
const APR = "apr0123456789abcdef0123";
const op = { userId: "op1", name: "Ana", email: "", role: "ADMIN++", permissions: { op_use: true }, tokenId: "t" } as unknown as OperatorContext;
const trace = { sessionId: "s1", requestId: "req1" };
const agora = new Date("2026-10-25T13:00:00Z");

const card = { id: CARD_ID, cardNumber: 4967, name: "Fulano", labelId: "lab1", archiveStatus: null, label: { name: "PEDIR PRONTUÁRIO" }, cardTags: [{ name: "PRONTUÁRIO SOLICITADO" }] };

function flow(state: WorkflowState, id = "req0", operatorId = "op1") {
  return { id, startedById: operatorId, lastOperatorId: operatorId, operatorIds: [operatorId], createdAt: new Date(state.criadoEm), state };
}
function stateWithPedido(): WorkflowState {
  const s = newState({ workflow: "prontuario", card: { id: CARD_ID, cardNumber: 4967, colunaId: "lab1" }, agora });
  return markDone(s, "pedido", { refs: [KEY], agora });
}
const draftOk = (over: Record<string, unknown> = {}) => ({ key: KEY, cardId: CARD_ID, operatorId: "op1", kind: "pedido_prontuario", template: "PEDIDO_HOSPITALAR", ...over });

beforeEach(() => {
  for (const m of Object.values(db)) {
    if (typeof m === "function") (m as ReturnType<typeof vi.fn>).mockReset();
    else for (const fn of Object.values(m)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  drafts.getDraft.mockReset();
  db.$transaction.mockImplementation(async (cb: (tx: typeof db) => unknown) => cb(db));
  db.$executeRaw.mockResolvedValue(1);
  db.user.findFirst.mockResolvedValue(card);
  db.opWorkflow.findMany.mockResolvedValue([]);
  db.opWorkflow.findUnique.mockResolvedValue(null);
  db.opWorkflow.create.mockResolvedValue({ id: "wf1" });
  db.opWorkflow.updateMany.mockResolvedValue({ count: 1 });
  db.opWorkflow.update.mockResolvedValue({});
  db.opApproval.updateMany.mockResolvedValue({ count: 1 });
  db.opApproval.findMany.mockResolvedValue([]);
  drafts.getDraft.mockResolvedValue(draftOk());
});

const save = (over: Partial<Parameters<typeof saveProgress>[0]> = {}) =>
  saveProgress({ op, trace, workflow: "prontuario", cardRef: "4967", agora, ...over });

describe("salvar_progresso", () => {
  it("primeiro passo cria o fluxo em op_workflows, com o prompt de origem como rastro", async () => {
    const out = await save({ passo: "pedido", refs: [KEY] });
    expect(out).toMatchObject({ salvo: true, novo: true, fluxo: "wf1" });
    const data = db.opWorkflow.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ workflow: "prontuario", cardId: CARD_ID, startedById: "op1", lastOperatorId: "op1", operatorIds: ["op1"], originRequestId: "req1", status: "em_andamento" });
    expect(data.state).toMatchObject({ v: 1, workflow: "prontuario", passo: "pedido", card: { id: CARD_ID, colunaId: "lab1" } });
    expect(data.state.feitos[0]).toMatchObject({ passo: "pedido", refs: [KEY], modelo: "PEDIDO_HOSPITALAR" });
    // Estado sem dado pessoal: o nome do card não vai para o JSON.
    expect(JSON.stringify(data.state)).not.toContain("Fulano");
  });

  it("sem requestId (hook fora do ar) o fluxo é guardado mesmo assim, sem origem", async () => {
    const out = await save({ passo: "pedido", refs: [KEY], trace: { sessionId: null, requestId: null } });
    expect(out).toMatchObject({ salvo: true, novo: true });
    expect(db.opWorkflow.create.mock.calls[0][0].data.originRequestId).toBeNull();
  });

  it("prompt de origem já marca outro fluxo → guarda sem origem (coluna única)", async () => {
    db.opWorkflow.findUnique.mockResolvedValue({ id: "wf0" });
    expect(await save({ passo: "pedido", refs: [KEY] })).toMatchObject({ salvo: true, novo: true });
    expect(db.opWorkflow.create.mock.calls[0][0].data.originRequestId).toBeNull();
  });

  it("fluxo aberto do mesmo workflow+card → continua o mesmo (um aberto só, de qualquer operador)", async () => {
    db.opWorkflow.findMany.mockResolvedValue([flow(stateWithPedido())]);
    const out = await save({ passo: "modo", refs: ["email"] });
    expect(out).toMatchObject({ salvo: true, novo: false, fluxo: "req0" });
    expect(db.opWorkflow.update.mock.calls[0][0].where).toEqual({ id: "req0" });
    expect(db.opWorkflow.create).not.toHaveBeenCalled();
    const where = db.opWorkflow.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ cardId: CARD_ID, workflow: "prontuario" });
    expect(where).not.toHaveProperty("startedById");
  });

  it("colega continua o fluxo: mesmo registro, entra em operatorIds e vira o último (decisão 20)", async () => {
    db.opWorkflow.findMany.mockResolvedValue([flow(stateWithPedido(), "req0", "op2")]);
    const out = await save({ passo: "modo", refs: ["email"] });
    expect(out).toMatchObject({ salvo: true, novo: false, fluxo: "req0", comecadoPor: "op2" });
    expect(db.opWorkflow.update.mock.calls[0][0].data).toMatchObject({ lastOperatorId: "op1", operatorIds: ["op2", "op1"], status: "em_andamento" });
  });

  it("procura e grava sob advisory lock do (workflow, card)", async () => {
    const order: string[] = [];
    db.$executeRaw.mockImplementation(async (_s: TemplateStringsArray, key: string) => {
      order.push(`lock:${key}`);
      return 1;
    });
    db.opWorkflow.findMany.mockImplementation(async () => {
      order.push("find");
      return [];
    });
    await save({ passo: "pedido", refs: [KEY] });
    // 1ª leitura = pré-checagem da ordem (sem lock); a que decide é a de dentro do lock.
    expect(order).toEqual(["find", `lock:op_wf:prontuario:${CARD_ID}`, "find"]);
  });

  it("fluxo parado há mais de 14 dias vira abandonado e nasce outro", async () => {
    const velho = { ...stateWithPedido(), atualizadoEm: "2026-10-01T12:00:00Z" };
    db.opWorkflow.findMany.mockResolvedValue([flow(velho)]);
    const out = await save({ passo: "pedido", refs: [KEY] });
    expect(db.opWorkflow.update.mock.calls[0][0]).toMatchObject({ where: { id: "req0" }, data: { status: "abandonado", state: { status: "abandonado" } } });
    expect(out).toMatchObject({ salvo: true, novo: true });
  });

  it("ref não confere: rascunho de outro card, de outro tipo, sem ref (o de colega vale — item K)", async () => {
    drafts.getDraft.mockResolvedValueOnce(draftOk({ cardId: "outro" }));
    await expect(save({ passo: "pedido", refs: [KEY] })).rejects.toMatchObject({ code: "ref_invalido" });
    drafts.getDraft.mockResolvedValueOnce(draftOk({ kind: "procuracao" }));
    await expect(save({ passo: "pedido", refs: [KEY] })).rejects.toMatchObject({ code: "ref_invalido" });
    drafts.getDraft.mockRejectedValueOnce(new drafts.DraftError("rascunho_expirado", "venceu"));
    await expect(save({ passo: "pedido", refs: [KEY] })).rejects.toMatchObject({ code: "ref_invalido" });
    await expect(save({ passo: "pedido" })).rejects.toMatchObject({ code: "ref_invalido" });
    expect(db.opWorkflow.create).not.toHaveBeenCalled();
  });

  it("enviar só com a aprovação executada; tag/coluna conferidas no card", async () => {
    const s = markDone(markDone(stateWithPedido(), "modo", { refs: ["email"], agora }), "preparar_email", { refs: [APR], agora });
    db.opWorkflow.findMany.mockResolvedValue([flow(s)]);
    db.opApproval.findUnique.mockResolvedValue({ id: APR, operatorId: "op1", cardId: CARD_ID, tool: "preparar_email", status: "pendente", expiresAt: new Date(Date.now() + 60_000), createdAt: agora });
    await expect(save({ passo: "enviar", refs: [APR] })).rejects.toMatchObject({ code: "ref_invalido" });
    db.opApproval.findUnique.mockResolvedValue({ id: APR, operatorId: "op1", cardId: CARD_ID, tool: "preparar_email", status: "executada", expiresAt: new Date(), createdAt: agora });
    await expect(save({ passo: "enviar", refs: [APR] })).resolves.toMatchObject({ salvo: true });

    const enviado = markDone(s, "enviar", { refs: [APR], agora });
    db.opWorkflow.findMany.mockResolvedValue([flow(enviado)]);
    await expect(save({ passo: "tag", refs: ["TAG QUE NAO TEM"] })).rejects.toMatchObject({ code: "ref_invalido" });
    const ok = await save({ passo: "tag", refs: ["prontuario solicitado"] });
    expect(ok).toMatchObject({ salvo: true });
    // grava o nome exato da tag do card
    expect(JSON.stringify(db.opWorkflow.update.mock.calls.at(-1)![0].data.state)).toContain("PRONTUÁRIO SOLICITADO");
    await expect(save({ passo: "mover", refs: ["AGUARDANDO PRONTUARIO"] })).rejects.toMatchObject({ code: "ref_invalido" });
  });

  it("passo fora da ordem → passo_invalido", async () => {
    db.opApproval.findUnique.mockResolvedValue({ id: APR, operatorId: "op1", cardId: CARD_ID, tool: "preparar_email", status: "pendente", expiresAt: new Date(Date.now() + 60_000), createdAt: agora });
    await expect(save({ passo: "preparar_email", refs: [APR] })).rejects.toMatchObject({ code: "passo_invalido" });
    await expect(save({ passo: "xpto" })).rejects.toMatchObject({ code: "passo_invalido" });
  });

  it("bloqueio grava onde parou sem marcar feito; campos/código fora da lista são descartados", async () => {
    db.opWorkflow.findMany.mockResolvedValue([flow(stateWithPedido())]);
    const out = await save({ passo: "modo", bloqueio: { tipo: "erro_externo", codigo: "sem_destinatario" } });
    expect(out).toMatchObject({ salvo: true, estado: { status: "bloqueado", bloqueio: { passo: "modo", codigo: "sem_destinatario" } } });
    expect((out as { estado: WorkflowState }).estado.feitos.map((f) => f.passo)).toEqual(["pedido"]);
    const out2 = await save({ passo: "modo", bloqueio: { tipo: "dado_faltante", campos: ["estado civil", "Maria da Silva"], codigo: "joao_silva" } });
    const b = (out2 as { estado: WorkflowState }).estado.bloqueio!;
    expect(b.campos).toEqual(["estado_civil"]);
    expect(b.codigo).toBeUndefined();
    expect(JSON.stringify(db.opWorkflow.update.mock.calls.at(-1)![0].data.state)).not.toMatch(/Maria|joao/);
  });

  it("aprovação anterior ao fluxo não marca envio (e-mail velho do mesmo card)", async () => {
    const s = markDone(markDone(stateWithPedido(), "modo", { refs: ["email"], agora }), "preparar_email", { refs: [APR], agora });
    db.opWorkflow.findMany.mockResolvedValue([flow(s)]);
    db.opApproval.findUnique.mockResolvedValue({
      id: APR, operatorId: "op1", cardId: CARD_ID, tool: "preparar_email", status: "executada", expiresAt: new Date(), createdAt: new Date("2026-09-01T12:00:00Z"),
    });
    await expect(save({ passo: "enviar", refs: [APR] })).rejects.toMatchObject({ code: "ref_invalido" });
  });

  it("previewOnly (script) calcula sem gravar nada", async () => {
    const out = await save({ passo: "pedido", refs: [KEY], previewOnly: true, trace: { sessionId: null, requestId: null } });
    expect(out).toMatchObject({ salvo: false, previewOnly: true });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.opWorkflow.update).not.toHaveBeenCalled();
    expect(db.opWorkflow.create).not.toHaveBeenCalled();
  });
});

describe("retomar_fluxo", () => {
  function emailPreparado() {
    return markDone(markDone(stateWithPedido(), "modo", { refs: ["email"], agora }), "preparar_email", { refs: [APR], agora });
  }

  it("qualquer operador retoma o fluxo do colega e passa a ser quem continuou (decisão 20)", async () => {
    db.opWorkflow.findUnique
      .mockResolvedValueOnce(flow(stateWithPedido(), "req0", "op2"))
      .mockResolvedValueOnce({ state: stateWithPedido(), operatorIds: ["op2"] });
    const out = await loadForResume({ op, fluxoId: "req0", write: true, agora });
    expect(out).toMatchObject({ aberto: true, gravado: true, comecadoPor: "op2", ultimoOperador: "op2" });
    expect(db.opWorkflow.update.mock.calls[0][0].data).toMatchObject({ lastOperatorId: "op1", operatorIds: ["op2", "op1"] });
    // rascunho do colega VALE para quem retoma (item K, 27/10): não refaz
    drafts.getDraft.mockResolvedValue(draftOk({ operatorId: "op2" }));
    db.opWorkflow.findUnique.mockResolvedValueOnce(flow(stateWithPedido(), "req0", "op2"));
    const out2 = await loadForResume({ op, fluxoId: "req0", write: false, agora });
    expect(out2).toMatchObject({ plano: { refazer: [], feitos: expect.arrayContaining([expect.objectContaining({ passo: "pedido" })]) } });
  });

  it("aprovação pendente da MESMA sessão e no prazo é reaproveitada (item J, 27/10): nada cancelado, aprovacaoValida com o código", async () => {
    db.opWorkflow.findMany.mockResolvedValue([flow(emailPreparado())]);
    db.opWorkflow.findUnique.mockResolvedValue({ state: emailPreparado(), operatorIds: ["op1"] });
    db.opApproval.findMany.mockResolvedValue([{ id: APR, status: "pendente", expiresAt: new Date(agora.getTime() + 10 * 60_000), operatorId: "op1", sessionId: "s1", code: "AB12CD" }]);
    const out = await loadForResume({ op, workflow: "prontuario", cardRef: "4967", write: true, agora, sessionId: "s1" });
    expect(db.opApproval.updateMany).not.toHaveBeenCalled();
    expect(out).toMatchObject({ aberto: true, plano: { aprovacaoValida: { passo: "preparar_email", approvalId: APR, codigo: "AB12CD" }, proximo: { passo: "enviar" }, refazer: [] } });
    // Outra sessão (ou sem sessão): cancela como antes.
    db.opApproval.findMany.mockResolvedValue([{ id: APR, status: "pendente", expiresAt: new Date(agora.getTime() + 10 * 60_000), operatorId: "op1", sessionId: "s1", code: "AB12CD" }]);
    const out2 = await loadForResume({ op, workflow: "prontuario", cardRef: "4967", write: true, agora, sessionId: "s2" });
    expect(db.opApproval.updateMany).toHaveBeenCalledWith({ where: { id: APR, cardId: CARD_ID, status: "pendente" }, data: { status: "cancelada" } });
    expect(out2).toMatchObject({ plano: { aprovacaoValida: null, proximo: { passo: "preparar_email" } } });
  });

  it("card sem fluxo aberto → aberto: false", async () => {
    expect(await loadForResume({ op, workflow: "prontuario", cardRef: "4967", write: true, agora })).toMatchObject({ aberto: false });
  });

  it("aprovação pendente é cancelada e o preparo volta (nunca reaproveita)", async () => {
    db.opWorkflow.findMany.mockResolvedValue([flow(emailPreparado())]);
    db.opWorkflow.findUnique.mockResolvedValue({ state: emailPreparado(), operatorIds: ["op1"] });
    db.opApproval.findMany.mockResolvedValue([{ id: APR, status: "pendente", expiresAt: new Date(agora.getTime() + 10 * 60_000) }]);
    const out = await loadForResume({ op, workflow: "prontuario", cardRef: "4967", write: true, agora });
    expect(db.opApproval.updateMany).toHaveBeenCalledWith({ where: { id: APR, cardId: CARD_ID, status: "pendente" }, data: { status: "cancelada" } });
    expect(out).toMatchObject({ aberto: true, gravado: true, plano: { proximo: { passo: "preparar_email" } } });
    const gravado = db.opWorkflow.update.mock.calls[0][0].data.state as WorkflowState;
    expect(gravado.feitos.map((f) => f.passo)).toEqual(["pedido", "modo"]);
  });

  it("interruptor desligado: não grava o estado, mas cancela a pendente", async () => {
    db.opWorkflow.findMany.mockResolvedValue([flow(emailPreparado())]);
    db.opApproval.findMany.mockResolvedValue([{ id: APR, status: "pendente", expiresAt: new Date(agora.getTime() + 10 * 60_000) }]);
    const out = await loadForResume({ op, workflow: "prontuario", cardRef: "4967", write: false, cancelarPendentes: true, agora });
    expect(db.opApproval.updateMany).toHaveBeenCalled();
    expect(db.opWorkflow.update).not.toHaveBeenCalled();
    expect(out).toMatchObject({ aberto: true, gravado: false });
  });

  it("script (sem escrita nenhuma): não cancela nem grava, plano igual", async () => {
    db.opWorkflow.findMany.mockResolvedValue([flow(emailPreparado())]);
    db.opApproval.findMany.mockResolvedValue([{ id: APR, status: "pendente", expiresAt: new Date(agora.getTime() + 10 * 60_000) }]);
    const out = await loadForResume({ op, workflow: "prontuario", cardRef: "4967", write: false, cancelarPendentes: false, agora });
    expect(db.opApproval.updateMany).not.toHaveBeenCalled();
    expect(db.opWorkflow.update).not.toHaveBeenCalled();
    expect(out).toMatchObject({ aberto: true, gravado: false, plano: { proximo: { passo: "preparar_email" } } });
  });

  it("rascunho vencido → refazer só o pedido", async () => {
    db.opWorkflow.findMany.mockResolvedValue([flow(stateWithPedido())]);
    db.opWorkflow.findUnique.mockResolvedValue({ state: stateWithPedido(), operatorIds: ["op1"] });
    drafts.getDraft.mockRejectedValue(new drafts.DraftError("rascunho_expirado", "venceu"));
    const out = await loadForResume({ op, workflow: "prontuario", cardRef: "4967", write: true, agora });
    expect(out).toMatchObject({ aberto: true, plano: { refazer: [{ passo: "pedido" }], proximo: { passo: "pedido" } } });
  });

  it("outra chamada salvou no meio → não sobrescreve", async () => {
    db.opWorkflow.findMany.mockResolvedValue([flow(stateWithPedido())]);
    db.opWorkflow.findUnique.mockResolvedValue({ state: { ...stateWithPedido(), atualizadoEm: "2026-10-25T13:05:00.000Z" }, operatorIds: ["op1"] });
    const out = await loadForResume({ op, workflow: "prontuario", cardRef: "4967", write: true, agora });
    expect(out).toMatchObject({ aberto: true, gravado: false });
    expect(db.opWorkflow.update).not.toHaveBeenCalled();
  });

  it("card mudou de coluna desde a pausa → aviso", async () => {
    db.opWorkflow.findMany.mockResolvedValue([flow(stateWithPedido())]);
    db.opWorkflow.findUnique.mockResolvedValue({ state: stateWithPedido(), operatorIds: ["op1"] });
    db.user.findFirst.mockResolvedValue({ ...card, labelId: "lab2" });
    const out = await loadForResume({ op, workflow: "prontuario", cardRef: "4967", write: true, agora });
    expect((out as { plano: { avisos: string[] } }).plano.avisos.join(" ")).toMatch(/mudou de coluna/);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

// Prisma, S3 (getDraft) e resolução de card mockados: o teste nunca toca produção.
const db = vi.hoisted(() => {
  const m = {
    opRequest: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
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
  return { id, operatorId, createdAt: new Date(state.criadoEm), state };
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
  db.opRequest.findMany.mockResolvedValue([]);
  db.opRequest.updateMany.mockResolvedValue({ count: 1 });
  db.opRequest.update.mockResolvedValue({});
  db.opApproval.updateMany.mockResolvedValue({ count: 1 });
  db.opApproval.findMany.mockResolvedValue([]);
  drafts.getDraft.mockResolvedValue(draftOk());
});

const save = (over: Partial<Parameters<typeof saveProgress>[0]> = {}) =>
  saveProgress({ op, trace, workflow: "prontuario", cardRef: "4967", agora, ...over });

describe("salvar_progresso", () => {
  it("primeiro passo cria o fluxo no prompt de origem (do operador, sem outro fluxo)", async () => {
    const out = await save({ passo: "pedido", refs: [KEY] });
    expect(out).toMatchObject({ salvo: true, novo: true, fluxo: "req1" });
    const call = db.opRequest.updateMany.mock.calls[0][0];
    expect(call.where).toMatchObject({ id: "req1", operatorId: "op1" });
    expect(call.data.state).toMatchObject({ v: 1, workflow: "prontuario", passo: "pedido", card: { id: CARD_ID, colunaId: "lab1" } });
    expect(call.data.state.feitos[0]).toMatchObject({ passo: "pedido", refs: [KEY], modelo: "PEDIDO_HOSPITALAR" });
    // Estado sem dado pessoal: o nome do card não vai para o JSON.
    expect(JSON.stringify(call.data.state)).not.toContain("Fulano");
  });

  it("sem requestId (hook sem token) → semRegistro, nada gravado", async () => {
    const out = await save({ passo: "pedido", refs: [KEY], trace: { sessionId: null, requestId: null } });
    expect(out).toMatchObject({ salvo: false, semRegistro: true });
    expect(db.opRequest.updateMany).not.toHaveBeenCalled();
  });

  it("prompt de origem já guarda outro fluxo → semRegistro", async () => {
    db.opRequest.updateMany.mockResolvedValue({ count: 0 });
    expect(await save({ passo: "pedido", refs: [KEY] })).toMatchObject({ salvo: false, semRegistro: true });
  });

  it("fluxo aberto do mesmo operador+workflow+card → continua o mesmo (um aberto só)", async () => {
    db.opRequest.findMany.mockResolvedValue([flow(stateWithPedido())]);
    const out = await save({ passo: "modo", refs: ["email"] });
    expect(out).toMatchObject({ salvo: true, novo: false, fluxo: "req0" });
    expect(db.opRequest.update.mock.calls[0][0].where).toEqual({ id: "req0" });
    expect(db.opRequest.updateMany).not.toHaveBeenCalled();
    const where = db.opRequest.findMany.mock.calls[0][0].where;
    expect(where.operatorId).toBe("op1");
    expect(JSON.stringify(where.AND)).toContain(CARD_ID);
  });

  it("procura e grava sob advisory lock do (operador, workflow, card)", async () => {
    const order: string[] = [];
    db.$executeRaw.mockImplementation(async (_s: TemplateStringsArray, key: string) => {
      order.push(`lock:${key}`);
      return 1;
    });
    db.opRequest.findMany.mockImplementation(async () => {
      order.push("find");
      return [];
    });
    await save({ passo: "pedido", refs: [KEY] });
    // 1ª leitura = pré-checagem da ordem (sem lock); a que decide é a de dentro do lock.
    expect(order).toEqual(["find", `lock:op_wf:op1:prontuario:${CARD_ID}`, "find"]);
  });

  it("fluxo parado há mais de 14 dias vira abandonado e nasce outro", async () => {
    const velho = { ...stateWithPedido(), atualizadoEm: "2026-10-01T12:00:00Z" };
    db.opRequest.findMany.mockResolvedValue([flow(velho)]);
    const out = await save({ passo: "pedido", refs: [KEY] });
    expect(db.opRequest.update.mock.calls[0][0]).toMatchObject({ where: { id: "req0" }, data: { state: { status: "abandonado" } } });
    expect(out).toMatchObject({ salvo: true, novo: true });
  });

  it("ref não confere: rascunho de outro operador, de outro card, de outro tipo, sem ref", async () => {
    drafts.getDraft.mockResolvedValueOnce(draftOk({ operatorId: "op2" }));
    await expect(save({ passo: "pedido", refs: [KEY] })).rejects.toMatchObject({ code: "ref_invalido" });
    drafts.getDraft.mockResolvedValueOnce(draftOk({ cardId: "outro" }));
    await expect(save({ passo: "pedido", refs: [KEY] })).rejects.toMatchObject({ code: "ref_invalido" });
    drafts.getDraft.mockResolvedValueOnce(draftOk({ kind: "procuracao" }));
    await expect(save({ passo: "pedido", refs: [KEY] })).rejects.toMatchObject({ code: "ref_invalido" });
    drafts.getDraft.mockRejectedValueOnce(new drafts.DraftError("rascunho_expirado", "venceu"));
    await expect(save({ passo: "pedido", refs: [KEY] })).rejects.toMatchObject({ code: "ref_invalido" });
    await expect(save({ passo: "pedido" })).rejects.toMatchObject({ code: "ref_invalido" });
    expect(db.opRequest.updateMany).not.toHaveBeenCalled();
  });

  it("enviar só com a aprovação executada; tag/coluna conferidas no card", async () => {
    const s = markDone(markDone(stateWithPedido(), "modo", { refs: ["email"], agora }), "preparar_email", { refs: [APR], agora });
    db.opRequest.findMany.mockResolvedValue([flow(s)]);
    db.opApproval.findUnique.mockResolvedValue({ id: APR, operatorId: "op1", cardId: CARD_ID, tool: "preparar_email", status: "pendente", expiresAt: new Date(Date.now() + 60_000), createdAt: agora });
    await expect(save({ passo: "enviar", refs: [APR] })).rejects.toMatchObject({ code: "ref_invalido" });
    db.opApproval.findUnique.mockResolvedValue({ id: APR, operatorId: "op1", cardId: CARD_ID, tool: "preparar_email", status: "executada", expiresAt: new Date(), createdAt: agora });
    await expect(save({ passo: "enviar", refs: [APR] })).resolves.toMatchObject({ salvo: true });

    const enviado = markDone(s, "enviar", { refs: [APR], agora });
    db.opRequest.findMany.mockResolvedValue([flow(enviado)]);
    await expect(save({ passo: "tag", refs: ["TAG QUE NAO TEM"] })).rejects.toMatchObject({ code: "ref_invalido" });
    const ok = await save({ passo: "tag", refs: ["prontuario solicitado"] });
    expect(ok).toMatchObject({ salvo: true });
    // grava o nome exato da tag do card
    expect(JSON.stringify(db.opRequest.update.mock.calls.at(-1)![0].data.state)).toContain("PRONTUÁRIO SOLICITADO");
    await expect(save({ passo: "mover", refs: ["AGUARDANDO PRONTUARIO"] })).rejects.toMatchObject({ code: "ref_invalido" });
  });

  it("passo fora da ordem → passo_invalido", async () => {
    db.opApproval.findUnique.mockResolvedValue({ id: APR, operatorId: "op1", cardId: CARD_ID, tool: "preparar_email", status: "pendente", expiresAt: new Date(Date.now() + 60_000), createdAt: agora });
    await expect(save({ passo: "preparar_email", refs: [APR] })).rejects.toMatchObject({ code: "passo_invalido" });
    await expect(save({ passo: "xpto" })).rejects.toMatchObject({ code: "passo_invalido" });
  });

  it("bloqueio grava onde parou sem marcar feito; campos/código fora da lista são descartados", async () => {
    db.opRequest.findMany.mockResolvedValue([flow(stateWithPedido())]);
    const out = await save({ passo: "modo", bloqueio: { tipo: "erro_externo", codigo: "sem_destinatario" } });
    expect(out).toMatchObject({ salvo: true, estado: { status: "bloqueado", bloqueio: { passo: "modo", codigo: "sem_destinatario" } } });
    expect((out as { estado: WorkflowState }).estado.feitos.map((f) => f.passo)).toEqual(["pedido"]);
    const out2 = await save({ passo: "modo", bloqueio: { tipo: "dado_faltante", campos: ["estado civil", "Maria da Silva"], codigo: "joao_silva" } });
    const b = (out2 as { estado: WorkflowState }).estado.bloqueio!;
    expect(b.campos).toEqual(["estado_civil"]);
    expect(b.codigo).toBeUndefined();
    expect(JSON.stringify(db.opRequest.update.mock.calls.at(-1)![0].data.state)).not.toMatch(/Maria|joao/);
  });

  it("aprovação anterior ao fluxo não marca envio (e-mail velho do mesmo card)", async () => {
    const s = markDone(markDone(stateWithPedido(), "modo", { refs: ["email"], agora }), "preparar_email", { refs: [APR], agora });
    db.opRequest.findMany.mockResolvedValue([flow(s)]);
    db.opApproval.findUnique.mockResolvedValue({
      id: APR, operatorId: "op1", cardId: CARD_ID, tool: "preparar_email", status: "executada", expiresAt: new Date(), createdAt: new Date("2026-09-01T12:00:00Z"),
    });
    await expect(save({ passo: "enviar", refs: [APR] })).rejects.toMatchObject({ code: "ref_invalido" });
  });

  it("previewOnly (script) calcula sem gravar nada", async () => {
    const out = await save({ passo: "pedido", refs: [KEY], previewOnly: true, trace: { sessionId: null, requestId: null } });
    expect(out).toMatchObject({ salvo: false, previewOnly: true });
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.opRequest.update).not.toHaveBeenCalled();
    expect(db.opRequest.updateMany).not.toHaveBeenCalled();
  });
});

describe("retomar_fluxo", () => {
  function emailPreparado() {
    return markDone(markDone(stateWithPedido(), "modo", { refs: ["email"], agora }), "preparar_email", { refs: [APR], agora });
  }

  it("só o dono retoma", async () => {
    db.opRequest.findUnique.mockResolvedValue(flow(stateWithPedido(), "req0", "op2"));
    await expect(loadForResume({ op, fluxoId: "req0", write: true, agora })).rejects.toMatchObject({ code: "sem_permissao" });
  });

  it("card sem fluxo aberto → aberto: false", async () => {
    expect(await loadForResume({ op, workflow: "prontuario", cardRef: "4967", write: true, agora })).toMatchObject({ aberto: false });
  });

  it("aprovação pendente é cancelada e o preparo volta (nunca reaproveita)", async () => {
    db.opRequest.findMany.mockResolvedValue([flow(emailPreparado())]);
    db.opRequest.findUnique.mockResolvedValue({ state: emailPreparado() });
    db.opApproval.findMany.mockResolvedValue([{ id: APR, status: "pendente", expiresAt: new Date(agora.getTime() + 10 * 60_000) }]);
    const out = await loadForResume({ op, workflow: "prontuario", cardRef: "4967", write: true, agora });
    expect(db.opApproval.updateMany).toHaveBeenCalledWith({ where: { id: APR, operatorId: "op1", status: "pendente" }, data: { status: "cancelada" } });
    expect(out).toMatchObject({ aberto: true, gravado: true, plano: { proximo: { passo: "preparar_email" } } });
    const gravado = db.opRequest.update.mock.calls[0][0].data.state as WorkflowState;
    expect(gravado.feitos.map((f) => f.passo)).toEqual(["pedido", "modo"]);
  });

  it("interruptor desligado: não grava o estado, mas cancela a pendente", async () => {
    db.opRequest.findMany.mockResolvedValue([flow(emailPreparado())]);
    db.opApproval.findMany.mockResolvedValue([{ id: APR, status: "pendente", expiresAt: new Date(agora.getTime() + 10 * 60_000) }]);
    const out = await loadForResume({ op, workflow: "prontuario", cardRef: "4967", write: false, cancelarPendentes: true, agora });
    expect(db.opApproval.updateMany).toHaveBeenCalled();
    expect(db.opRequest.update).not.toHaveBeenCalled();
    expect(out).toMatchObject({ aberto: true, gravado: false });
  });

  it("script (sem escrita nenhuma): não cancela nem grava, plano igual", async () => {
    db.opRequest.findMany.mockResolvedValue([flow(emailPreparado())]);
    db.opApproval.findMany.mockResolvedValue([{ id: APR, status: "pendente", expiresAt: new Date(agora.getTime() + 10 * 60_000) }]);
    const out = await loadForResume({ op, workflow: "prontuario", cardRef: "4967", write: false, cancelarPendentes: false, agora });
    expect(db.opApproval.updateMany).not.toHaveBeenCalled();
    expect(db.opRequest.update).not.toHaveBeenCalled();
    expect(out).toMatchObject({ aberto: true, gravado: false, plano: { proximo: { passo: "preparar_email" } } });
  });

  it("rascunho vencido → refazer só o pedido", async () => {
    db.opRequest.findMany.mockResolvedValue([flow(stateWithPedido())]);
    db.opRequest.findUnique.mockResolvedValue({ state: stateWithPedido() });
    drafts.getDraft.mockRejectedValue(new drafts.DraftError("rascunho_expirado", "venceu"));
    const out = await loadForResume({ op, workflow: "prontuario", cardRef: "4967", write: true, agora });
    expect(out).toMatchObject({ aberto: true, plano: { refazer: [{ passo: "pedido" }], proximo: { passo: "pedido" } } });
  });

  it("outra chamada salvou no meio → não sobrescreve", async () => {
    db.opRequest.findMany.mockResolvedValue([flow(stateWithPedido())]);
    db.opRequest.findUnique.mockResolvedValue({ state: { ...stateWithPedido(), atualizadoEm: "2026-10-25T13:05:00.000Z" } });
    const out = await loadForResume({ op, workflow: "prontuario", cardRef: "4967", write: true, agora });
    expect(out).toMatchObject({ aberto: true, gravado: false });
    expect(db.opRequest.update).not.toHaveBeenCalled();
  });

  it("card mudou de coluna desde a pausa → aviso", async () => {
    db.opRequest.findMany.mockResolvedValue([flow(stateWithPedido())]);
    db.opRequest.findUnique.mockResolvedValue({ state: stateWithPedido() });
    db.user.findFirst.mockResolvedValue({ ...card, labelId: "lab2" });
    const out = await loadForResume({ op, workflow: "prontuario", cardRef: "4967", write: true, agora });
    expect((out as { plano: { avisos: string[] } }).plano.avisos.join(" ")).toMatch(/mudou de coluna/);
  });
});

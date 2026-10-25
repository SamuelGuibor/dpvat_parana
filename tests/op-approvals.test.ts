import { describe, it, expect, vi, beforeEach } from "vitest";

// Prisma mockado: o teste nunca toca produção.
const db = vi.hoisted(() => ({
  opApproval: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  opRequest: { findFirst: vi.fn() },
}));
vi.mock("@/app/_shared/lib/prisma", () => ({ db }));

import { createApproval, executeApproval, findTypedApproval } from "@/app/_shared/lib/op/approvals";
import { canonicalHash } from "@/app/_shared/lib/op/policy";
import { approvalCode } from "@/app/_shared/utils/approval-code";

const args = { cardId: "c1", para: "h@hosp.com", cc: [], assunto: "Pedido", corpo: "Oi", anexos: [] };
const created = new Date("2026-10-25T10:00:00Z");

function row(over: Record<string, unknown> = {}) {
  const id = "apr1";
  return {
    id,
    operatorId: "op1",
    sessionId: "s1",
    tool: "preparar_email",
    canal: "email",
    args,
    hash: canonicalHash("preparar_email", args),
    code: approvalCode(id),
    status: "pendente",
    cardId: "c1",
    expiresAt: new Date(Date.now() + 10 * 60_000),
    createdAt: created,
    result: null,
    ...over,
  };
}

/** Último prompt da sessão (o que o hook gravou). */
function lastPrompt(text: string | null, operatorId = "op1") {
  db.opRequest.findFirst.mockResolvedValue(text === null ? null : { id: "req9", operatorId, text });
}

beforeEach(() => {
  for (const m of Object.values(db)) for (const fn of Object.values(m)) (fn as ReturnType<typeof vi.fn>).mockReset();
  db.opApproval.updateMany.mockResolvedValue({ count: 1 });
  db.opApproval.update.mockResolvedValue({});
});

const exec = (over: Partial<Parameters<typeof executeApproval>[0]> = {}) =>
  executeApproval({
    approvalId: "apr1",
    hash: canonicalHash("preparar_email", args),
    operatorId: "op1",
    sessionId: "s1",
    send: async () => ({ sent: true, id: "ses-1" }),
    ...over,
  });

describe("createApproval", () => {
  it("sem sessão do app não cria (não daria para provar o aprovo)", async () => {
    await expect(createApproval({ operatorId: "op1", sessionId: null, tool: "preparar_email", canal: "email", args, cardId: "c1" })).rejects.toMatchObject({ code: "sem_sessao" });
    expect(db.opApproval.create).not.toHaveBeenCalled();
  });

  it("grava hash canônico, código do id e vencimento de 30 min", async () => {
    db.opApproval.findFirst.mockResolvedValue(null);
    const out = await createApproval({ operatorId: "op1", sessionId: "s1", tool: "preparar_email", canal: "email", args, cardId: "c1" });
    expect(out.hash).toBe(canonicalHash("preparar_email", args));
    expect(out.code).toBe(approvalCode(out.approvalId));
    expect(out.expiresAt.getTime() - Date.now()).toBeGreaterThan(29 * 60_000);
    const data = db.opApproval.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ operatorId: "op1", sessionId: "s1", hash: out.hash, code: out.code, canal: "email" });
    expect(data.status).toBeUndefined(); // default do banco: pendente
  });

  it("código repetido numa pendente da mesma sessão → sorteia outro", async () => {
    db.opApproval.findFirst.mockResolvedValueOnce({ id: "x" }).mockResolvedValue(null);
    await createApproval({ operatorId: "op1", sessionId: "s1", tool: "preparar_email", canal: "email", args, cardId: "c1" });
    expect(db.opApproval.findFirst).toHaveBeenCalledTimes(2);
  });
});

describe("hash muda com qualquer campo do conteúdo", () => {
  it("para, cc, assunto, corpo, anexo", () => {
    const h = canonicalHash("preparar_email", args);
    expect(canonicalHash("preparar_email", { ...args, para: "outro@hosp.com" })).not.toBe(h);
    expect(canonicalHash("preparar_email", { ...args, cc: ["x@y.com"] })).not.toBe(h);
    expect(canonicalHash("preparar_email", { ...args, assunto: "Pedido!" })).not.toBe(h);
    expect(canonicalHash("preparar_email", { ...args, corpo: "Oi." })).not.toBe(h);
    expect(canonicalHash("preparar_email", { ...args, anexos: [{ key: "k", etag: "e" }] })).not.toBe(h);
    expect(canonicalHash("preparar_whatsapp", args)).not.toBe(h);
  });
});

describe("findTypedApproval", () => {
  const a = row();
  it("procura só prompts da sessão da preparação, depois dela", async () => {
    lastPrompt(`aprovo ${a.code}`);
    expect(await findTypedApproval(a)).toBe("req9");
    const where = db.opRequest.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ sessionId: "s1", createdAt: { gt: created } });
  });
  it("prompt de outro operador não vale", async () => {
    lastPrompt(`aprovo ${a.code}`, "op2");
    expect(await findTypedApproval(a)).toBeNull();
  });
  it("nenhum prompt depois da preparação (o de antes não conta) → null", async () => {
    lastPrompt(null);
    expect(await findTypedApproval(a)).toBeNull();
  });
  it("última mensagem não é o aprovo (outra depois) → null", async () => {
    lastPrompt("espera, troca o assunto");
    expect(await findTypedApproval(a)).toBeNull();
  });
});

describe("executeApproval", () => {
  it("modelo chamando sozinho (sem prompt) → aprovacao_nao_digitada, nada enviado", async () => {
    db.opApproval.findUnique.mockResolvedValue(row());
    lastPrompt("prepara o e-mail do 2342");
    const send = vi.fn();
    await expect(exec({ send })).rejects.toMatchObject({ code: "aprovacao_nao_digitada" });
    expect(send).not.toHaveBeenCalled();
    expect(db.opApproval.updateMany).not.toHaveBeenCalled();
  });

  it("outra sessão do app → aprovacao_nao_digitada", async () => {
    db.opApproval.findUnique.mockResolvedValue(row());
    lastPrompt(`aprovo ${row().code}`);
    await expect(exec({ sessionId: "s2" })).rejects.toMatchObject({ code: "aprovacao_nao_digitada" });
    await expect(exec({ sessionId: null })).rejects.toMatchObject({ code: "aprovacao_nao_digitada" });
  });

  it("outro operador → sem_permissao", async () => {
    db.opApproval.findUnique.mockResolvedValue(row());
    await expect(exec({ operatorId: "op2" })).rejects.toMatchObject({ code: "sem_permissao" });
  });

  it("hash diferente do preparado ou conteúdo adulterado no banco → hash_diferente", async () => {
    db.opApproval.findUnique.mockResolvedValue(row());
    await expect(exec({ hash: "0".repeat(64) })).rejects.toMatchObject({ code: "hash_diferente" });
    db.opApproval.findUnique.mockResolvedValue(row({ args: { ...args, para: "outro@x.com" } }));
    await expect(exec()).rejects.toMatchObject({ code: "hash_diferente" });
  });

  it("vencida → aprovacao_expirada e marca expirada", async () => {
    db.opApproval.findUnique.mockResolvedValue(row({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(exec()).rejects.toMatchObject({ code: "aprovacao_expirada" });
    expect(db.opApproval.updateMany.mock.calls[0][0].data).toEqual({ status: "expirada" });
  });

  it("aprovo digitado → reserva, envia uma vez, grava executada", async () => {
    db.opApproval.findUnique.mockResolvedValue(row());
    lastPrompt(`Aprovo ${row().code.toLowerCase()}`);
    const send = vi.fn(async () => ({ sent: true, id: "ses-1" }));
    const out = await exec({ send });
    expect(out).toMatchObject({ noop: false, status: "executada", result: { sent: true } });
    expect(send).toHaveBeenCalledTimes(1);
    expect(db.opApproval.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "apr1", status: "pendente" },
      data: { status: "enviando", approvedRequestId: "req9" },
    });
    expect(db.opApproval.update.mock.calls[0][0].data).toMatchObject({ status: "executada" });
  });

  it("executar de novo = noop com o resultado da primeira (nada sai)", async () => {
    db.opApproval.findUnique.mockResolvedValue(row({ status: "executada", result: { sent: true, id: "ses-1" } }));
    const send = vi.fn();
    const out = await exec({ send });
    expect(out).toMatchObject({ noop: true, result: { sent: true, id: "ses-1" } });
    expect(send).not.toHaveBeenCalled();
  });

  it("corrida: outra chamada reservou antes → não envia", async () => {
    db.opApproval.findUnique.mockResolvedValueOnce(row()).mockResolvedValueOnce(row({ status: "enviando" }));
    lastPrompt(`aprovo ${row().code}`);
    db.opApproval.updateMany.mockResolvedValue({ count: 0 });
    const send = vi.fn();
    await expect(exec({ send })).rejects.toMatchObject({ code: "envio_em_andamento" });
    expect(send).not.toHaveBeenCalled();
  });

  it("enviando preso (queda no meio) nunca reenvia", async () => {
    db.opApproval.findUnique.mockResolvedValue(row({ status: "enviando" }));
    await expect(exec()).rejects.toMatchObject({ code: "envio_em_andamento" });
  });

  it("falha do canal → falhou (encerrada); precheck barra antes da reserva", async () => {
    db.opApproval.findUnique.mockResolvedValue(row());
    lastPrompt(`aprovo ${row().code}`);
    const out = await exec({ send: async () => ({ sent: false, error: "cooldown" }) });
    expect(out.status).toBe("falhou");
    expect(db.opApproval.update.mock.calls[0][0].data).toMatchObject({ status: "falhou" });

    db.opApproval.updateMany.mockClear();
    const err = Object.assign(new Error("anexo mudou"), { code: "hash_diferente" });
    await expect(exec({ precheck: async () => { throw err; } })).rejects.toMatchObject({ code: "hash_diferente" });
    expect(db.opApproval.updateMany).not.toHaveBeenCalled();
  });

  it("falhou/cancelada não executa de novo", async () => {
    db.opApproval.findUnique.mockResolvedValue(row({ status: "falhou" }));
    await expect(exec()).rejects.toMatchObject({ code: "aprovacao_encerrada" });
  });
});

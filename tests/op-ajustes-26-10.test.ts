import { describe, it, expect, vi, beforeEach } from "vitest";

// Ajustes de 26/10 (docs/ai-first/09-decisoes-dono-26-10.md): editar cadastro,
// documentos, comentário da IA, tarefa, exclusão/arquivo irreversível e o
// relatório próprio. Prisma mockado: o teste nunca toca o banco de produção.
const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn(), findMany: vi.fn() },
  process: { findUnique: vi.fn(), update: vi.fn() },
  whatsAppContact: { updateMany: vi.fn() },
  document: { findFirst: vi.fn(), update: vi.fn() },
  comment: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  mention: { findFirst: vi.fn(), updateMany: vi.fn() },
  log: { create: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/app/_shared/lib/prisma", () => ({ db }));
vi.mock("@/app/_shared/lib/op/cards", () => ({ resolveOneCardId: vi.fn(async () => "c1") }));

import { normalizeCampo, planCadastro, resolveCampo } from "@/app/_shared/utils/cadastro-ia";
import { updateCardFields } from "@/app/_shared/lib/cards/cadastro";
import { writeDocument } from "@/app/_shared/lib/cards/documents";
import { editOpComment } from "@/app/_shared/lib/cards/comment-edit";
import { deleteCardById } from "@/app/_shared/lib/cards/delete";
import { setMentionStatusFor } from "@/app/_shared/lib/mention-status";
import { precheckIrreversivel, prepareIrreversivel } from "@/app/_shared/lib/op/irreversivel";
import type { OperatorContext } from "@/app/_shared/lib/op/auth";

const author = { id: "op1", name: "Ana (via IA)" };
const trace = { sessionId: "s1", requestId: "r1" };
const common = { cardId: "c1", isProcess: false, author, source: "op" as const, op: trace };
const logData = () => db.log.create.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);
const opCtx = (perms: Record<string, boolean>) =>
  ({ userId: "op1", name: "Ana", email: "a@x", role: "ADMIN", permissions: { op_use: true, op_write: true, op_approve: true, ...perms }, tokenId: "t" }) as unknown as OperatorContext;

beforeEach(() => {
  for (const model of Object.values(db)) for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset();
  db.user.findUnique.mockResolvedValue(null);
  db.whatsAppContact.updateMany.mockResolvedValue({ count: 1 });
});

describe("cadastro (puro)", () => {
  it("campo pelo rótulo ou id; proibidos com motivo; desconhecido = null", () => {
    expect(resolveCampo("data do acidente")).toEqual({ campo: "data_acidente" });
    expect(resolveCampo("Nome da Mãe")).toEqual({ campo: "nome_mae" });
    expect(resolveCampo("telefone_secundario")).toEqual({ campo: "telefone_secundario" });
    expect(resolveCampo("senha_inss")).toHaveProperty("proibido");
    expect(resolveCampo("senha do INSS")).toHaveProperty("proibido");
    expect(resolveCampo("status")).toHaveProperty("proibido");
    expect(resolveCampo("email")).toHaveProperty("proibido");
    expect(resolveCampo("role")).toHaveProperty("proibido");
    expect(resolveCampo("apelido")).toBeNull();
  });
  it("normaliza como o updateUser (só dígitos) e valida", () => {
    expect(normalizeCampo("cpf", "529.982.247-25")).toEqual({ ok: true, valor: "52998224725" });
    expect(normalizeCampo("cpf", "111.111.111-12")).toMatchObject({ ok: false });
    expect(normalizeCampo("telefone", "(41) 99999-0000")).toEqual({ ok: true, valor: "41999990000" });
    expect(normalizeCampo("telefone", "99999-0000")).toMatchObject({ ok: false });
    expect(normalizeCampo("cep", "80.000-000")).toEqual({ ok: true, valor: "80000000" });
    expect(normalizeCampo("estado", "pr")).toEqual({ ok: true, valor: "PR" });
    expect(normalizeCampo("rua", "   ")).toMatchObject({ ok: false });
    expect(normalizeCampo("rua", "a\nb")).toMatchObject({ ok: false });
  });
  it("vazio → preencher; com valor → trocar; igual → fica de fora", () => {
    const p = planCadastro({ rg: null, profissao: "pedreiro", cidade: "Curitiba" }, { rg: "123", profissao: "motorista", cidade: "Curitiba" });
    expect(p.mudancas).toEqual([
      { campo: "rg", rotulo: "RG", de: null, para: "123", tipo: "preencher" },
      { campo: "profissao", rotulo: "profissão", de: "pedreiro", para: "motorista", tipo: "trocar" },
    ]);
    expect(p.iguais).toEqual(["cidade"]);
  });
});

describe("updateCardFields", () => {
  it("grava só o que mudou, propaga o nome ao WhatsApp e loga de/para com origem op", async () => {
    db.user.findUnique.mockResolvedValueOnce({ name: "Joao", rg: null, service: "INSS" });
    const r = await updateCardFields({ ...common, campos: { name: "João da Silva", rg: "123" } });
    expect(r).toEqual({ noop: false, alterados: ["name", "rg"] });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { name: "João da Silva", rg: "123" } });
    expect(db.whatsAppContact.updateMany).toHaveBeenCalledWith({ where: { userId: "c1" }, data: { name: "João da Silva" } });
    const log = logData()[0];
    expect(log).toMatchObject({ action: "update", authorId: "op1", authorName: "Ana (via IA)", userId: "c1" });
    expect(log.metadata).toMatchObject({ source: "op", op: trace });
  });
  it("nada mudou = noop sem update nem log; campo fora da lista é ignorado", async () => {
    db.user.findUnique.mockResolvedValueOnce({ rg: "123", service: null });
    const r = await updateCardFields({ ...common, campos: { rg: "123", senha_inss: "x" } as never });
    expect(r.noop).toBe(true);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.log.create).not.toHaveBeenCalled();
  });
});

describe("writeDocument", () => {
  const doc = { id: "d1", key: "uploads/user_c1/1-rg.pdf", name: "rg.pdf", category: "OUTROS", deletedAt: null };
  it("lixeira marca deletedAt (restaurável) e nunca apaga do S3", async () => {
    db.document.findFirst.mockResolvedValue(doc);
    await writeDocument({ ...common, documentId: "d1", acao: { tipo: "lixeira" } });
    expect(db.document.update.mock.calls[0][0].data).toMatchObject({ deletedAt: expect.any(Date), deletedBy: "Ana (via IA)" });
    expect(logData()[0]).toMatchObject({ action: "document_remove" });
  });
  it("renomear mantém a extensão da key; mover de pasta loga de/para; mesma pasta = noop", async () => {
    db.document.findFirst.mockResolvedValue(doc);
    await writeDocument({ ...common, documentId: "d1", acao: { tipo: "renomear", nome: "RG Joao" } });
    expect(db.document.update.mock.calls[0][0].data.name).toMatch(/\.pdf$/);
    await writeDocument({ ...common, documentId: "d1", acao: { tipo: "mover_pasta", pasta: "IDENTIFICACAO" } });
    expect(logData().at(-1)).toMatchObject({ action: "document_move" });
    expect(await writeDocument({ ...common, documentId: "d1", acao: { tipo: "mover_pasta", pasta: "OUTROS" } })).toEqual({ noop: true });
  });
  it("documento na lixeira só restaura; documento de outro card não acha", async () => {
    db.document.findFirst.mockResolvedValue({ ...doc, deletedAt: new Date() });
    await expect(writeDocument({ ...common, documentId: "d1", acao: { tipo: "lixeira" } })).rejects.toThrow(/lixeira/);
    await writeDocument({ ...common, documentId: "d1", acao: { tipo: "restaurar" } });
    expect(db.document.update.mock.calls.at(-1)![0].data).toEqual({ deletedAt: null, deletedBy: null });
    expect(db.document.findFirst.mock.calls[0][0].where).toMatchObject({ id: "d1", userId: "c1" });
  });
});

describe("editOpComment", () => {
  it("só o comentário do próprio operador feito pela IA; o texto antigo vai para o log", async () => {
    db.comment.findFirst.mockResolvedValue({ id: "k1", text: "antigo", authorId: "op2", authorName: "Bia (via IA)" });
    await expect(editOpComment({ ...common, commentId: "k1", text: "novo" })).rejects.toThrow(/você mesmo/);
    db.comment.findFirst.mockResolvedValue({ id: "k1", text: "antigo", authorId: "op1", authorName: "Ana" });
    await expect(editOpComment({ ...common, commentId: "k1", text: null })).rejects.toThrow(/você mesmo/);
    db.comment.findFirst.mockResolvedValue({ id: "k1", text: "antigo", authorId: "op1", authorName: "Ana (via IA)" });
    await editOpComment({ ...common, commentId: "k1", text: null });
    expect(db.comment.delete).toHaveBeenCalledWith({ where: { id: "k1" } });
    expect(logData()[0].metadata).toMatchObject({ stage: "comment_delete", from: "antigo", source: "op" });
  });
});

describe("setMentionStatusFor", () => {
  it("só a cópia do destinatário; tarefa de setor muda o grupo; ciente depois de concluída = noop", async () => {
    db.mention.findFirst.mockResolvedValue(null);
    await expect(setMentionStatusFor("op1", "m1", "DONE")).rejects.toThrow();
    db.mention.findFirst.mockResolvedValue({ status: "PENDING", ackAt: null, groupId: "g1" });
    await setMentionStatusFor("op1", "m1", "DONE");
    expect(db.mention.updateMany.mock.calls[0][0].where).toEqual({ groupId: "g1" });
    db.mention.findFirst.mockResolvedValue({ status: "DONE", ackAt: new Date(), groupId: null });
    expect(await setMentionStatusFor("op1", "m1", "ACK")).toMatchObject({ noop: true });
  });
});

describe("ação irreversível (L4)", () => {
  const card = { id: "c1", cardNumber: 4967, name: "Fulano", role: "X", labelId: "L1", archiveStatus: null, label: { name: "X" }, _count: { document: 3, commentsOnCard: 2 } };
  it("excluir exige delete_cards; arquivar só em destino que encerra", async () => {
    db.user.findUnique.mockResolvedValue(card);
    await expect(prepareIrreversivel({ op: opCtx({ delete_cards: false }), card: "4967", acao: "excluir_card" })).rejects.toMatchObject({ code: "sem_permissao" });
    const ex = await prepareIrreversivel({ op: opCtx({ delete_cards: true }), card: "4967", acao: "excluir_card" });
    expect(ex.args).toMatchObject({ acao: "excluir_card", cardId: "c1", labelId: "L1", archiveStatus: null, destino: null });
    expect(JSON.stringify(ex.previa)).toMatch(/IRREVERSÍVEL/);
    await expect(prepareIrreversivel({ op: opCtx({ archive_cards: true }), card: "4967", acao: "arquivar_definitivo", destino: "APTOS CCS" })).rejects.toMatchObject({ code: "nao_encontrado" });
    const ar = await prepareIrreversivel({ op: opCtx({ archive_cards: true }), card: "4967", acao: "arquivar_definitivo", destino: "desistiram_expressamente" });
    expect(ar.args.destino).toBe("desistiram_expressamente");
  });
  it("card mudou desde a preparação → hash_diferente (nada é feito)", async () => {
    db.user.findUnique.mockResolvedValue({ ...card, labelId: "L2" });
    await expect(precheckIrreversivel({ acao: "excluir_card", cardId: "c1", cardNumber: 4967, nome: "Fulano", labelId: "L1", archiveStatus: null, destino: null })).rejects.toMatchObject({ code: "hash_diferente" });
    db.user.findUnique.mockResolvedValue(null);
    await expect(precheckIrreversivel({ acao: "excluir_card", cardId: "c1", cardNumber: 4967, nome: "Fulano", labelId: "L1", archiveStatus: null, destino: null })).rejects.toMatchObject({ code: "hash_diferente" });
  });
  it("deleteCardById: log sem userId (sobrevive à cascata), com nº e origem", async () => {
    db.user.findUnique.mockResolvedValueOnce({ cardNumber: 4967, name: "Fulano", role: "X", archiveStatus: null, label: { name: "X" } });
    db.log.findMany.mockResolvedValue([{ message: "moveu para X", authorName: "Ana", createdAt: new Date(0), metadata: null }]);
    await deleteCardById({ ...common });
    expect(db.user.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
    const log = logData()[0];
    expect(log).toMatchObject({ action: "card_delete", userId: null });
    expect(log.metadata).toMatchObject({ cardNumber: 4967, source: "op", movimentos: [{ msg: "moveu para X" }] });
  });
});

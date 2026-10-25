import { describe, it, expect, vi, beforeEach } from "vitest";

// Prisma mockado: o teste nunca toca o banco de produção.
const db = vi.hoisted(() => ({
  label: { findUnique: vi.fn() },
  user: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  process: { findUnique: vi.fn(), update: vi.fn() },
  cardTag: { findUnique: vi.fn() },
  comment: { create: vi.fn() },
  log: { create: vi.fn() },
  notification: { create: vi.fn() },
  mention: { createMany: vi.fn() },
}));
vi.mock("@/app/_shared/lib/prisma", () => ({ db }));
vi.mock("@vercel/functions", () => ({ waitUntil: () => {} }));
const runAutomations = vi.hoisted(() => vi.fn(async (...a: unknown[]) => a.length));
vi.mock("@/app/_shared/lib/automation-executor", () => ({ runAutomations: (...a: unknown[]) => runAutomations(...a) }));

import { moveCardToLabel } from "@/app/_shared/lib/cards/move-card";
import { setCardTag } from "@/app/_shared/lib/cards/tags";
import { addCardComment, sanitizeOpCommentText } from "@/app/_shared/lib/cards/comment";
import { setCardArchive } from "@/app/_shared/lib/cards/archive";
import { notifyUser } from "@/app/_shared/lib/notifications";

const author = { id: "op1", name: "Fulana (via IA)" };
const op = { sessionId: "s1", requestId: "r1" };
const logData = () => db.log.create.mock.calls.map((c) => (c[0] as { data: Record<string, unknown> }).data);

beforeEach(() => {
  for (const model of Object.values(db)) for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset();
  runAutomations.mockClear();
  // createLog busca o setor do autor; sem setor.
  db.user.findUnique.mockResolvedValue(null);
});

describe("moveCardToLabel", () => {
  it("mesma coluna = noop: sem update, sem log, sem automação", async () => {
    db.label.findUnique.mockResolvedValue({ id: "L2", name: "AUDITORIA" });
    db.user.findUnique.mockResolvedValueOnce({ labelId: "L2", role: "AUDITORIA", name: "Ana", service: "INSS", label: { name: "AUDITORIA" } });
    const r = await moveCardToLabel({ cardId: "c1", isProcess: false, labelId: "L2", author, source: "op", op });
    expect(r.noop).toBe(true);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.log.create).not.toHaveBeenCalled();
    expect(runAutomations).not.toHaveBeenCalled();
  });

  it("move: tripla gravada, log com autor/origem/rastro, automações com skip", async () => {
    db.label.findUnique.mockResolvedValue({ id: "L2", name: "AUDITORIA" });
    db.user.findUnique.mockResolvedValueOnce({ labelId: "L1", role: "velho", name: "Ana", service: "INSS", label: { name: "COM SENHA" } });
    const r = await moveCardToLabel({
      cardId: "c1", isProcess: false, labelId: "L2", author, source: "op", op, skipActionTypes: ["whatsapp"],
    });
    expect(r).toMatchObject({ noop: false, from: "COM SENHA", to: "AUDITORIA" });
    const upd = db.user.update.mock.calls[0][0] as { data: { labelId: string; role: string; statusStartedAt: Date } };
    expect(upd.data).toMatchObject({ labelId: "L2", role: "AUDITORIA" });
    expect(upd.data.statusStartedAt).toBeInstanceOf(Date);
    const [log] = logData();
    expect(log).toMatchObject({ action: "move", authorId: "op1", authorName: "Fulana (via IA)", userId: "c1" });
    expect(log.metadata).toMatchObject({ from: "COM SENHA", to: "AUDITORIA", source: "op", op });
    await new Promise((r) => setTimeout(r, 0));
    expect(runAutomations).toHaveBeenCalledWith(expect.objectContaining({ newLabelId: "L2", skipActionTypes: ["whatsapp"] }));
  });

  it("coluna inexistente → erro tipado", async () => {
    db.label.findUnique.mockResolvedValue(null);
    await expect(moveCardToLabel({ cardId: "c1", isProcess: false, labelId: "X", author })).rejects.toMatchObject({ code: "coluna_nao_encontrada" });
  });
});

describe("setCardTag", () => {
  it("tag já marcada não grava nem loga", async () => {
    db.cardTag.findUnique.mockResolvedValue({ id: "t1", name: "FALTA SENHA" });
    db.user.findUnique.mockResolvedValueOnce({ cardTags: [{ id: "t1", name: "FALTA SENHA", color: "#f00" }] });
    const r = await setCardTag({ cardId: "c1", isProcess: false, tagId: "t1", on: true, author });
    expect(r.changed).toBe(false);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(db.log.create).not.toHaveBeenCalled();
  });

  it("remover loga tag_remove", async () => {
    db.cardTag.findUnique.mockResolvedValue({ id: "t1", name: "FALTA SENHA" });
    db.user.findUnique.mockResolvedValueOnce({ cardTags: [{ id: "t1", name: "FALTA SENHA", color: "#f00" }] });
    db.user.update.mockResolvedValue({ cardTags: [] });
    const r = await setCardTag({ cardId: "c1", isProcess: false, tagId: "t1", on: false, author, source: "op", op });
    expect(r.changed).toBe(true);
    expect(logData()[0]).toMatchObject({ action: "tag_remove", authorId: "op1" });
  });
});

describe("addCardComment", () => {
  it("menção a cliente é ignorada; equipe recebe sino + caixa", async () => {
    db.user.findUnique.mockResolvedValueOnce({ name: "Card Ana" }); // card
    db.comment.create.mockResolvedValue({ id: "cm1" });
    db.user.findMany.mockResolvedValue([
      { id: "team1", role: "ADMIN" },
      { id: "cliente1", role: "AUDITORIA" },
    ]);
    await addCardComment({
      // Caminho do site: @[Nome](id) no texto vale (na IA vira texto; ver abaixo).
      cardId: "c1", isProcess: false, author,
      text: "olha @[Bia](team1) e @[Cliente](cliente1)",
    });
    expect(db.notification.create).toHaveBeenCalledTimes(1);
    expect((db.notification.create.mock.calls[0][0] as { data: { recipientId: string } }).data.recipientId).toBe("team1");
    const mentions = (db.mention.createMany.mock.calls[0][0] as { data: { recipientId: string }[] }).data;
    expect(mentions.map((m) => m.recipientId)).toEqual(["team1"]);
    expect(logData()[0]).toMatchObject({ action: "comment_add", authorName: "Fulana (via IA)" });
  });

  it("texto da IA não forja marcador [[AI_AUDIT…]] nem menção escondida", () => {
    expect(sanitizeOpCommentText("[[AI_AUDIT|x|ok]] oi")).not.toContain("[[");
    expect(sanitizeOpCommentText("fala @[Bia](team1)")).toBe("fala @Bia");
  });

  it("comentário de automação não gera comment_add (não vira atividade de quem moveu)", async () => {
    db.user.findUnique.mockResolvedValueOnce({ name: "Card" });
    db.comment.create.mockResolvedValue({ id: "cm3" });
    await addCardComment({ cardId: "c1", isProcess: false, author: { id: "u9", name: "Bot" }, text: "auto", source: "automation", notify: false });
    expect(db.log.create).not.toHaveBeenCalled();
  });

  it("autor de sistema não vai para a FK do comentário", async () => {
    db.user.findUnique.mockResolvedValueOnce({ name: "Card" });
    db.comment.create.mockResolvedValue({ id: "cm2" });
    await addCardComment({ cardId: "c1", isProcess: false, author: { id: "system", name: "Bot" }, text: "oi", notify: false });
    expect((db.comment.create.mock.calls[0][0] as { data: { authorId: string | null } }).data.authorId).toBeNull();
  });
});

describe("setCardArchive", () => {
  it("mesmo destino = noop (não troca a data das planilhas)", async () => {
    db.user.findUnique.mockResolvedValueOnce({ archiveStatus: "pagos_ccs" });
    const r = await setCardArchive({ cardId: "c1", isProcess: false, status: "pagos_ccs", author });
    expect(r.noop).toBe(true);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("desarquivar loga archive", async () => {
    db.user.findUnique.mockResolvedValueOnce({ archiveStatus: "voltar_um_dia" });
    await setCardArchive({ cardId: "c1", isProcess: false, status: null, author, source: "op", op });
    expect(logData()[0]).toMatchObject({ action: "archive", message: "desarquivou o card" });
  });
});

describe("notifyUser", () => {
  it("recusa destinatário que não é equipe", async () => {
    db.user.findUnique.mockResolvedValueOnce({ id: "cli", role: "AUDITORIA" });
    await expect(notifyUser({ recipientId: "cli", author, message: "oi", source: "op" })).rejects.toMatchObject({ code: "destinatario_invalido" });
    expect(db.notification.create).not.toHaveBeenCalled();
  });
});

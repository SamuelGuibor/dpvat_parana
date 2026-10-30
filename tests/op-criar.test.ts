import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

// Prisma mockado: o teste nunca toca o banco de produção.
const db = vi.hoisted(() => ({
  label: { findUnique: vi.fn(), findFirst: vi.fn() },
  user: { create: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn() },
  devTicket: { create: vi.fn() },
  sector: { findMany: vi.fn() },
  $queryRawUnsafe: vi.fn(),
}));
vi.mock("@/app/_shared/lib/prisma", () => ({ db }));
const createLog = vi.hoisted(() => vi.fn());
vi.mock("@/app/_shared/lib/log", () => ({ createLog: (...a: unknown[]) => createLog(...a) }));
const parecidos = vi.hoisted(() => ({ cpf: [] as string[], phone: [] as string[] }));
vi.mock("@/app/_shared/lib/op/cards", () => ({
  cardIdsByCpf: async () => parecidos.cpf,
  cardIdsByPhone: async () => parecidos.phone,
  columnName: (r: { label: { name: string } | null; role: string }) => r.label?.name ?? r.role,
  resolveOneCardId: async () => "card1",
}));
vi.mock("@/app/_shared/lib/op/tools/listar-colunas", () => ({
  loadColumnNames: async () => [{ id: "L1", nome: "TRIAGEM", ordem: 0, prazoDias: null }],
  loadColumns: async () => [{ id: "L1", nome: "TRIAGEM", ordem: 0, prazoDias: null, cardsAtivos: 0 }],
}));

import { createUserRow } from "@/app/_shared/lib/cards/create";
import { criarCard, criarTicketDevTool } from "@/app/_shared/lib/op/tools/criar";
import { prepareMembro, precheckMembro } from "@/app/_shared/lib/op/membro";
import { skillFromPrompt } from "@/app/_shared/lib/op/record";

const CPF = "52998224725";
const author = { id: "op1", name: "Fulana (via IA)" };
const trace = { sessionId: "s1", requestId: "r1" };
const op = (perms: Record<string, boolean> = {}) =>
  ({ userId: "op1", name: "Fulana", email: "f@x.com", role: "ADMIN", permissions: { op_use: true, op_write: true, ...perms } }) as never;
const ctx = (perms?: Record<string, boolean>) => ({ op: op(perms), trace, previewOnly: false }) as never;

beforeEach(() => {
  for (const model of Object.values(db)) {
    if (typeof model === "function") (model as ReturnType<typeof vi.fn>).mockReset();
    else for (const fn of Object.values(model)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  createLog.mockReset();
  parecidos.cpf = [];
  parecidos.phone = [];
  db.$queryRawUnsafe.mockResolvedValue([{ nextval: BigInt(5001) }]);
  db.label.findFirst.mockResolvedValue({ id: "L1", name: "TRIAGEM" });
  db.label.findUnique.mockResolvedValue({ id: "L1", name: "TRIAGEM" });
  db.user.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: "novo", status: data.status ?? null, service: data.service ?? null, ...data }));
  db.user.findMany.mockResolvedValue([]);
});

describe("createUserRow (site + IA)", () => {
  it("card: só dígitos no CPF, placeholder de e-mail, role = nome da coluna, etapa 1 e log create com a origem", async () => {
    await createUserRow({ name: "Ana", cpf: "529.982.247-25", passwordHash: null, author, source: "op", op: trace });
    const data = db.user.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ cpf: CPF, email: `${CPF}@inserir-email.com`, role: "TRIAGEM", labelId: "L1", password: null, status: "INSS_S1", cardNumber: 5001 });
    const log = createLog.mock.calls[0][0] as { action: string; metadata: Record<string, unknown> };
    expect(log.action).toBe("create");
    expect(log.metadata).toMatchObject({ source: "op", op: trace, cardNumber: 5001 });
  });

  it("membro: sem coluna, sem etapa e sem log de Criações", async () => {
    await createUserRow({ name: "Bia", cpf: CPF, passwordHash: null, email: "bia@x.com", role: "ADMIN", author });
    const data = db.user.create.mock.calls[0][0].data;
    expect(data.labelId).toBeNull();
    expect(data.status).toBeUndefined();
    expect(createLog).not.toHaveBeenCalled();
  });

  it("e-mail repetido vira erro esperado (email_em_uso)", async () => {
    db.user.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "6", meta: { target: ["email"] } }));
    await expect(createUserRow({ name: "Ana", cpf: CPF, passwordHash: null, author })).rejects.toMatchObject({ code: "email_em_uso" });
  });

  it("segundo card do mesmo CPF sem e-mail: placeholder com o nº do card", async () => {
    db.user.findUnique.mockResolvedValueOnce({ id: "antigo" });
    await createUserRow({ name: "Ana", cpf: CPF, passwordHash: null, author });
    expect(db.user.create.mock.calls[0][0].data.email).toBe(`${CPF}-5001@inserir-email.com`);
  });
});

describe("criar_card", () => {
  const parse = (a: Record<string, unknown>) => criarCard.schema.parse(a);

  it("CPF inválido não chega ao banco", async () => {
    await expect(criarCard.run(ctx(), parse({ nome: "Ana Teste", cpf: "11111111111", confirmar: true }))).rejects.toMatchObject({ code: "argumentos_invalidos" });
    expect(db.user.create).not.toHaveBeenCalled();
  });

  it("sem parecidos: cria direto com confirmar, sem senha, autor (via IA)", async () => {
    const r = (await criarCard.run(ctx(), parse({ nome: "Ana Teste", cpf: CPF, confirmar: true }))) as { data: { feito: boolean } };
    expect(r.data.feito).toBe(true);
    expect(db.user.create.mock.calls[0][0].data.password).toBeNull();
    expect((createLog.mock.calls[0][0] as { authorName: string }).authorName).toBe("Fulana (via IA)");
  });

  it("CPF já no CRM: exige confirmação e mostra os parecidos; com o hash, cria", async () => {
    parecidos.cpf = ["c9"];
    db.user.findMany.mockResolvedValue([
      { id: "c9", cardNumber: 77, name: "Ana Antiga", cpf: CPF, role: "X", archiveStatus: null, createdAt: new Date("2026-01-01"), label: { name: "AUDITORIA" } },
    ]);
    const err = await criarCard.run(ctx(), parse({ nome: "Ana Teste", cpf: CPF, confirmar: true })).catch((e) => e);
    expect(err.code).toBe("requer_confirmacao");
    const previa = err.details.previa as { previa_hash: string; parecidos: { cardNumber: number }[] };
    expect(previa.parecidos[0].cardNumber).toBe(77);
    expect(db.user.create).not.toHaveBeenCalled();
    await criarCard.run(ctx(), parse({ nome: "Ana Teste", cpf: CPF, confirmar: true, previa_hash: previa.previa_hash }));
    expect(db.user.create).toHaveBeenCalledTimes(1);
  });

  it("reenvio logo depois (mesmo CPF e nome, criado há pouco) = noop", async () => {
    parecidos.cpf = ["c9"];
    db.user.findMany.mockResolvedValue([{ id: "c9", cardNumber: 78, name: "Ana Teste", cpf: CPF, role: "X", archiveStatus: null, createdAt: new Date(), label: null }]);
    const r = (await criarCard.run(ctx(), parse({ nome: "ana teste", cpf: CPF, confirmar: true }))) as { data: { noop: boolean } };
    expect(r.data.noop).toBe(true);
    expect(db.user.create).not.toHaveBeenCalled();
  });
});

describe("criar_ticket_dev", () => {
  it("sempre pede confirmação; com o hash cria com autor (via IA)", async () => {
    db.devTicket.create.mockResolvedValue({ id: "cmticketabc12", type: "BUG", status: "EM_DISTRIBUICAO" });
    const args = criarTicketDevTool.schema.parse({ titulo: "Salvar não funciona", tipo: "BUG", descricao: "No card 2342 o botão salvar não grava.", confirmar: true });
    const err = await criarTicketDevTool.run(ctx(), args).catch((e) => e);
    expect(err.code).toBe("requer_confirmacao");
    await criarTicketDevTool.run(ctx(), { ...args, previa_hash: err.details.previa.previa_hash });
    expect(db.devTicket.create.mock.calls[0][0].data).toMatchObject({ type: "BUG", creatorId: "op1", creatorName: "Fulana (via IA)" });
  });
});

describe("preparar_membro_equipe (lib)", () => {
  const base = { nome: "Bia Souza", email: "Bia@X.com", cpf: CPF, cargo: "ADMIN" as const };

  it("sem manage_team recusa antes do banco", async () => {
    await expect(prepareMembro({ op: op(), ...base })).rejects.toMatchObject({ code: "sem_permissao" });
    expect(db.user.findFirst).not.toHaveBeenCalled();
  });

  it("e-mail em uso recusa; livre prepara com e-mail minúsculo e sem senha nos args", async () => {
    // conflitos(): 1ª busca = e-mail (sem diferenciar caixa), 2ª = CPF na equipe.
    db.user.findFirst.mockResolvedValueOnce({ id: "x" }).mockResolvedValueOnce(null);
    await expect(prepareMembro({ op: op({ manage_team: true }), ...base })).rejects.toMatchObject({ code: "email_em_uso" });
    expect(db.user.findFirst.mock.calls[0][0].where.email).toEqual({ equals: "bia@x.com", mode: "insensitive" });
    db.user.findFirst.mockResolvedValue(null);
    const { args } = await prepareMembro({ op: op({ manage_team: true }), ...base });
    expect(args).toEqual({ acao: "criar_membro", nome: "Bia Souza", email: "bia@x.com", cpf: CPF, telefone: null, cargo: "ADMIN" });
  });

  it("precheck: CPF virou membro desde a preparação = hash_diferente", async () => {
    db.user.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ name: "Bia" });
    await expect(precheckMembro({ acao: "criar_membro", nome: "Bia", email: "bia@x.com", cpf: CPF, telefone: null, cargo: "ADMIN" })).rejects.toMatchObject({ code: "hash_diferente" });
  });
});

describe("skillFromPrompt (plugin do operador)", () => {
  it("aceita /prontuario e /crm:prontuario", () => {
    expect(skillFromPrompt("/prontuario 2342")).toBe("prontuario");
    expect(skillFromPrompt("/crm:prontuario 2342")).toBe("prontuario");
    expect(skillFromPrompt("/crm:meu-dia")).toBe("meu-dia");
    expect(skillFromPrompt("me ajuda")).toBeNull();
  });
});

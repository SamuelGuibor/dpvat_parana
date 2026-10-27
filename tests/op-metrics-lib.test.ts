import { describe, it, expect, vi, beforeEach } from "vitest";

// Prisma e guard de permissão mockados: o teste nunca toca produção.
const db = vi.hoisted(() => ({
  opRequest: { findMany: vi.fn() },
  opToolCall: { findMany: vi.fn() },
  opApproval: { findMany: vi.fn() },
  opSession: { groupBy: vi.fn() },
  user: { findMany: vi.fn() },
  $queryRaw: vi.fn(),
}));
vi.mock("@/app/_shared/lib/prisma", () => ({ db }));
vi.mock("next/cache", () => ({ unstable_noStore: vi.fn() }));
const perms = vi.hoisted(() => ({ requirePermission: vi.fn(), requireTeam: vi.fn() }));
vi.mock("@/app/_shared/lib/permissions-server", () => perms);

import { getOpMetrics, getOpPrompts, loadOpMetricRows, maskOpToken } from "@/app/_shared/lib/op/metrics";
import { getOpMetricsAction, getOpPromptsAction } from "@/app/_actions/op/metrics";
import { shapeRelatorio, RELATORIO_TIPOS, gerarRelatorio } from "@/app/_shared/lib/op/tools/relatorio";
import { resolveOpPeriod } from "@/app/_shared/utils/op-metrics";

const agora = new Date("2026-10-25T13:00:00Z");
const periodo = resolveOpPeriod({ dias: 7 }, agora);
const CARD = "cmsp9hqlk0001l904y4fyvnku";

/** Texto SQL de uma chamada de $queryRaw (Prisma.sql → strings). */
function sqlOf(call: unknown[]): string {
  const q = call[0] as { strings?: string[]; sql?: string };
  return q.strings ? q.strings.join("?") : String(q.sql ?? q);
}

beforeEach(() => {
  for (const m of Object.values(db)) {
    if (typeof m === "function") (m as ReturnType<typeof vi.fn>).mockReset();
    else for (const fn of Object.values(m)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  perms.requirePermission.mockReset();
  db.opRequest.findMany.mockResolvedValue([]);
  db.opToolCall.findMany.mockResolvedValue([]);
  db.opApproval.findMany.mockResolvedValue([]);
  db.opSession.groupBy.mockResolvedValue([]);
  db.user.findMany.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([]);
});

describe("lib de métricas", () => {
  it("todas as leituras têm corte de data; nenhum select traz text ou args", async () => {
    await loadOpMetricRows(periodo, null);
    const req = db.opRequest.findMany.mock.calls[0][0];
    expect(req.where.createdAt).toEqual({ gte: periodo.gte, lt: periodo.lt });
    expect(req.select).not.toHaveProperty("text");
    expect(req.select).not.toHaveProperty("state");
    expect(req.take).toBeGreaterThan(0);
    const apr = db.opApproval.findMany.mock.calls[0][0];
    expect(apr.where.createdAt).toEqual({ gte: periodo.gte, lt: periodo.lt });
    expect(apr.select).not.toHaveProperty("args");
    expect(apr.select).not.toHaveProperty("result");
    const [calls, flows] = db.$queryRaw.mock.calls.map(sqlOf);
    expect(calls).toMatch(/"createdAt" >= \? AND "createdAt" < \?/);
    expect(calls).toMatch(/LIMIT/);
    // args só aparece dentro do booleano do confirmar
    expect(calls.replace("args->>'confirmar'", "")).not.toMatch(/\bargs\b/);
    expect(calls).not.toMatch(/\btext\b/);
    expect(flows).toMatch(/FROM op_workflows/);
    // os dois ramos (período e abertos de antes) têm corte de data
    expect(flows.match(/"createdAt" >= \?/g)).toHaveLength(2);
    expect(flows).not.toMatch(/\btext\b/);
    expect(flows).not.toMatch(/DISTINCT/i);
  });

  it("filtro por operador entra em todas as leituras", async () => {
    await loadOpMetricRows(periodo, "op9");
    expect(db.opRequest.findMany.mock.calls[0][0].where.operatorId).toBe("op9");
    expect(db.opApproval.findMany.mock.calls[0][0].where.operatorId).toBe("op9");
    for (const c of db.$queryRaw.mock.calls) expect((c[0] as { values: unknown[] }).values).toContain("op9");
  });

  it("getOpMetrics resolve nomes e nº dos cards conduzidos", async () => {
    db.opRequest.findMany.mockResolvedValue([{ id: "r1", operatorId: "op1", sessionId: "s1", skill: null, createdAt: agora }]);
    db.$queryRaw
      .mockResolvedValueOnce([
        { id: "c1", operatorId: "op1", requestId: "r1", sessionId: "s1", tool: "adicionar_tag", level: 3, ok: true, code: null, confirmed: true, noop: false, cardIds: [CARD], durationMs: 50, createdAt: agora },
      ])
      .mockResolvedValueOnce([]);
    db.user.findMany.mockImplementation(async (q: { where: { id: { in: string[] }; role?: unknown } }) =>
      q.where.role ? [{ id: CARD, cardNumber: 4967, name: "Fulano", role: "AUDITORIA", archiveStatus: null, label: { name: "AUDITORIA" } }] : [{ id: "op1", name: "Ana" }],
    );
    const m = await getOpMetrics({ periodo, agora });
    expect(m.nomes).toEqual({ op1: "Ana" });
    expect(m.cardsInfo[CARD]).toMatchObject({ cardNumber: 4967, coluna: "AUDITORIA" });
    expect(m.totais.cardsConduzidos).toBe(1);
  });

  it("prompts: classifica sem texto, busca texto só da página, esconde conversas e mascara token", async () => {
    db.opRequest.findMany
      .mockResolvedValueOnce([
        { id: "r1", operatorId: "op1", skill: null, createdAt: agora },
        { id: "r2", operatorId: "op1", skill: "cliente", createdAt: agora },
      ])
      .mockResolvedValueOnce([{ id: "r2", text: "/cliente 4967 meu token crmop_abcdefghijklmnopqrstuvwxyz" }]);
    db.opToolCall.findMany.mockResolvedValue([{ requestId: "r2", tool: "buscar_cliente", level: 1 }]);
    db.user.findMany.mockResolvedValue([{ id: "op1", name: "Ana" }]);
    const r = await getOpPrompts({ periodo });
    const heads = db.opRequest.findMany.mock.calls[0][0];
    expect(heads.select).not.toHaveProperty("text");
    expect(heads.where.createdAt).toEqual({ gte: periodo.gte, lt: periodo.lt });
    expect(db.opToolCall.findMany.mock.calls[0][0].where.createdAt.gte).toEqual(periodo.gte);
    expect(db.opToolCall.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: "desc" });
    expect(db.opRequest.findMany.mock.calls[1][0].where.id.in).toEqual(["r2"]);
    expect(r.total).toBe(1);
    expect(r.itens[0]).toMatchObject({ id: "r2", classe: "consulta", operador: "Ana", ferramentas: ["buscar_cliente"] });
    expect(r.itens[0].texto).not.toMatch(/abcdefghij/);
    expect(maskOpToken("x crmop_AAAAAAAAAAAA y")).toMatch(/^x crmop_•+/);
  });
});

describe("actions da tela", () => {
  it("sem manager_dashboard: texto recusado antes do banco; números só do próprio (decisão 5)", async () => {
    perms.requirePermission.mockRejectedValue(new Error("Você não tem permissão para esta ação."));
    await expect(getOpPromptsAction({ dias: 7 })).rejects.toThrow(/permissão/);
    expect(perms.requirePermission).toHaveBeenCalledWith("manager_dashboard");
    expect(db.opRequest.findMany).not.toHaveBeenCalled();
    // Sem op_use nem gestor: recusa antes do banco.
    perms.requireTeam.mockResolvedValue({ userId: "op1", name: "Ana", email: "a@x", permissions: { manager_dashboard: false, op_use: false } });
    await expect(getOpMetricsAction({ dias: 7 })).rejects.toThrow(/permissão/);
    expect(db.$queryRaw).not.toHaveBeenCalled();
    // Com op_use: o operatorId pedido é ignorado, vale o da sessão.
    perms.requireTeam.mockResolvedValue({ userId: "op1", name: "Ana", email: "a@x", permissions: { manager_dashboard: false, op_use: true } });
    const r = await getOpMetricsAction({ dias: 7, operatorId: "outra" });
    expect(r.escopo).toBe("proprio");
    expect(r.operadores).toEqual([{ id: "op1", nome: "Ana" }]);
    for (const c of db.opRequest.findMany.mock.calls) expect(JSON.stringify(c[0].where)).not.toContain("outra");
    expect(JSON.stringify(db.opRequest.findMany.mock.calls[0][0].where)).toContain("op1");
  });

  it("com a permissão: período inválido vira erro com mensagem própria", async () => {
    perms.requirePermission.mockResolvedValue({ permissions: { manager_dashboard: true } });
    perms.requireTeam.mockResolvedValue({ userId: "g1", name: "Gestor", email: "g@x", permissions: { manager_dashboard: true, op_use: true } });
    await expect(getOpMetricsAction({ de: "2026-01-01", ate: "2026-10-25" })).rejects.toThrow(/90 dias/);
    await expect(getOpMetricsAction({ dias: 7 })).resolves.toHaveProperty("metrics.periodo.dias", 7);
  });
});

describe("gerar_relatorio", () => {
  it("nenhum tipo devolve texto de prompt, args nem nome de cliente", async () => {
    db.opRequest.findMany.mockResolvedValue([{ id: "r1", operatorId: "op1", sessionId: "s1", skill: "prontuario", createdAt: agora }]);
    db.$queryRaw.mockImplementation(async (q: { strings: string[] }) =>
      q.strings.join("").includes("op_tool_calls")
        ? [{ id: "c1", operatorId: "op1", requestId: "r1", sessionId: "s1", tool: "mover_card", level: 3, ok: false, code: "estado_mudou", confirmed: true, noop: false, cardIds: [CARD], durationMs: 10, createdAt: agora }]
        : [],
    );
    db.opApproval.findMany.mockResolvedValue([{ id: "a1", operatorId: "op1", canal: "email", status: "pendente", cardId: CARD, expiresAt: new Date(0), createdAt: agora }]);
    db.user.findMany.mockImplementation(async (q: { where: { role?: unknown } }) =>
      q.where.role ? [{ id: CARD, cardNumber: 4967, name: "Fulano de Tal", role: "X", archiveStatus: null, label: { name: "X" } }] : [{ id: "op1", name: "Ana" }],
    );
    const m = await getOpMetrics({ periodo, agora });
    for (const tipo of RELATORIO_TIPOS) {
      const json = JSON.stringify(shapeRelatorio(tipo, m));
      expect(json).not.toMatch(/Fulano/);
      expect(json).not.toMatch(/"args"|"text"|"texto"/);
    }
    const falhas = shapeRelatorio("falhas", m) as { porCodigo: { code: string; exemplos: string[]; cards: number[] }[] };
    expect(falhas.porCodigo[0]).toMatchObject({ code: "estado_mudou", exemplos: ["c1"], cards: [4967] });
    const apr = shapeRelatorio("aprovacoes", m) as { lista: { status: string; card: number }[] };
    expect(apr.lista[0]).toMatchObject({ status: "expirada", card: 4967 });
  });
});

describe("gerar_relatorio sem Visão do Gestor (decisão 5)", () => {
  const ctx = (manager: boolean) => ({
    op: { userId: "op1", name: "Ana", email: "a@x", role: "ADMIN", permissions: { op_use: true, manager_dashboard: manager }, tokenId: "t" },
    trace: { sessionId: null, requestId: null },
  });
  it("vê só o próprio; pedir outra pessoa é recusado (não cai calado no próprio)", async () => {
    const out = await gerarRelatorio.run(ctx(false) as never, { tipo: "operacao" } as never);
    expect(out.data).toMatchObject({ escopo: "proprio", operador: "Ana" });
    expect(db.opRequest.findMany.mock.calls[0][0].where.operatorId).toBe("op1");
    db.user.findMany.mockResolvedValue([{ id: "op2", name: "Bia" }]);
    await expect(gerarRelatorio.run(ctx(false) as never, { tipo: "operacao", operador: "Bia" } as never)).rejects.toMatchObject({ code: "sem_permissao" });
  });
  it("gestor sem operador vê a equipe", async () => {
    const out = await gerarRelatorio.run(ctx(true) as never, { tipo: "operacao" } as never);
    expect(out.data).toMatchObject({ escopo: "equipe" });
    expect(db.opRequest.findMany.mock.calls[0][0].where).not.toHaveProperty("operatorId");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { markDone, newState } from "@/app/_shared/utils/workflows";

// Item I (27/10): as ferramentas do fluxo gravam o passo sozinhas, só quando o
// interruptor está ligado e há fluxo aberto do card na vez daquele passo.

const switches = vi.hoisted(() => ({ value: { salvar_progresso: true } as Record<string, boolean> }));
const wf = vi.hoisted(() => ({ openFlows: vi.fn(), saveProgress: vi.fn() }));
vi.mock("@/app/_shared/lib/prisma", () => ({ db: {} }));
vi.mock("@/app/_shared/lib/op/switches", () => ({ getOpSwitches: vi.fn(async () => switches.value) }));
vi.mock("@/app/_shared/lib/op/workflow", () => ({ openFlows: wf.openFlows, saveProgress: wf.saveProgress }));

import { autoProgress } from "@/app/_shared/lib/op/progress";

const agora = new Date("2026-10-27T13:00:00Z");
const op = { userId: "op1" } as never;
const trace = { sessionId: "s1", requestId: "r1" };
const CARD = "card00000000000000000001";

function flow(state: ReturnType<typeof newState>, id = "wf1") {
  return { id, state, createdAt: agora, startedById: "op1", lastOperatorId: "op1", operatorIds: ["op1"] };
}
const prontuarioAberto = () => markDone(markDone(markDone(newState({ workflow: "prontuario", card: { id: CARD, cardNumber: 1, colunaId: "l1" }, agora }), "card", { agora }), "hospital", { agora }), "pendencias", { agora });

beforeEach(() => {
  vi.clearAllMocks();
  switches.value = { salvar_progresso: true };
  wf.saveProgress.mockImplementation(async (i: { passo: string }) => ({ salvo: true, fluxo: "wf1", novo: false, proximo: { id: `depois-de-${i.passo}` } }));
});

describe("autoProgress", () => {
  it("fluxo aberto na vez do passo → grava com o ref e devolve fluxo/passo/próximo", async () => {
    wf.openFlows.mockResolvedValue([flow(prontuarioAberto())]);
    const r = await autoProgress({ op, trace, cardId: CARD, match: (s) => s.kind === "rascunho" && s.rascunho === "pedido_prontuario", refs: ["op-drafts/x/1.pdf"], agora });
    expect(r).toEqual({ fluxo: "wf1", workflow: "prontuario", passo: "pedido", proximo: "depois-de-pedido" });
    expect(wf.saveProgress).toHaveBeenCalledWith(expect.objectContaining({ workflow: "prontuario", cardId: CARD, passo: "pedido", refs: ["op-drafts/x/1.pdf"], op, trace }));
    expect(wf.openFlows).toHaveBeenCalledWith({}, { cardId: CARD });
  });

  it("nunca abre fluxo novo: sem fluxo aberto → null, sem chamar saveProgress", async () => {
    wf.openFlows.mockResolvedValue([]);
    expect(await autoProgress({ op, trace, cardId: CARD, match: (s) => s.kind === "rascunho", refs: ["k"], agora })).toBeNull();
    expect(wf.saveProgress).not.toHaveBeenCalled();
  });

  it("passo fora da vez (anexar antes do pedido) → null", async () => {
    wf.openFlows.mockResolvedValue([flow(prontuarioAberto())]);
    expect(await autoProgress({ op, trace, cardId: CARD, match: (s) => s.kind === "anexo", refs: ["d1"], agora })).toBeNull();
    expect(wf.saveProgress).not.toHaveBeenCalled();
  });

  it("interruptor desligado ou modo de teste → null sem tocar o banco", async () => {
    switches.value = { salvar_progresso: false };
    wf.openFlows.mockResolvedValue([flow(prontuarioAberto())]);
    expect(await autoProgress({ op, trace, cardId: CARD, match: (s) => s.kind === "rascunho", refs: ["k"], agora })).toBeNull();
    expect(wf.openFlows).not.toHaveBeenCalled();
    switches.value = { salvar_progresso: true };
    expect(await autoProgress({ op, trace, previewOnly: true, cardId: CARD, match: (s) => s.kind === "rascunho", refs: ["k"], agora })).toBeNull();
    expect(wf.openFlows).not.toHaveBeenCalled();
  });

  it("falha do saveProgress (ref inválido, lock) nunca derruba a ferramenta → null", async () => {
    wf.openFlows.mockResolvedValue([flow(prontuarioAberto())]);
    wf.saveProgress.mockRejectedValue(new Error("ref_invalido"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await autoProgress({ op, trace, cardId: CARD, match: (s) => s.kind === "rascunho" && s.rascunho === "pedido_prontuario", refs: ["k"], agora })).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("fluxo parado há mais de 14 dias é ignorado", async () => {
    const velho = { ...prontuarioAberto(), atualizadoEm: "2026-09-01T00:00:00.000Z" };
    wf.openFlows.mockResolvedValue([flow(velho)]);
    expect(await autoProgress({ op, trace, cardId: CARD, match: (s) => s.kind === "rascunho", refs: ["k"], agora })).toBeNull();
    expect(wf.saveProgress).not.toHaveBeenCalled();
  });
});

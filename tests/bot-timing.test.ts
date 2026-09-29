import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOT_TURN_BUDGET_MS, BRAIN_BUDGET_MARGIN_MS, BRAIN_MIN_ATTEMPT_MS, BURST_DEBOUNCE_MS,
  brainAttemptTimeoutMs, brainTimeoutError, isBrainTimeoutError, isTerminalBotAction, microBudgetMs,
  settleWithin, shouldAbortSend,
} from "@/app/_shared/utils/bot-timing";

// Laço de envio do bot (whatsapp/bot.ts): antes de cada bloco da resposta,
// decide se o bot segue falando. Até 25/09/2026 o bot mandava tudo e ainda
// executava a ação, mesmo com o atendente já na conversa ou com o cliente
// escrevendo no meio do roteiro.

describe("isTerminalBotAction", () => {
  it("qualify, disqualify, handoff e resolve fecham o turno", () => {
    for (const a of ["qualify", "disqualify", "handoff", "resolve"]) {
      expect(isTerminalBotAction(a)).toBe(true);
    }
  });

  it("continue, send_flow e lookup não fecham", () => {
    for (const a of ["continue", "send_flow", "lookup", ""]) {
      expect(isTerminalBotAction(a)).toBe(false);
    }
  });
});

describe("shouldAbortSend", () => {
  it("sem mensagem nova e ainda com o bot: segue mandando", () => {
    expect(shouldAbortSend({ hasNewerInbound: false, stillBot: true, action: "continue", blocksSent: 0 }))
      .toBe("continue_sending");
    expect(shouldAbortSend({ hasNewerInbound: false, stillBot: true, action: "qualify", blocksSent: 2 }))
      .toBe("continue_sending");
  });

  it("conversa saiu do modo bot: para tudo, inclusive a ação", () => {
    for (const action of ["continue", "qualify", "disqualify", "handoff", "resolve", "send_flow"]) {
      expect(shouldAbortSend({ hasNewerInbound: false, stillBot: false, action, blocksSent: 0 })).toBe("stop_all");
      expect(shouldAbortSend({ hasNewerInbound: true, stillBot: false, action, blocksSent: 2 })).toBe("stop_all");
    }
  });

  it("mensagem nova antes do 1º bloco: para tudo (a invocação nova responde o lote inteiro)", () => {
    for (const action of ["continue", "qualify", "disqualify", "handoff", "resolve", "send_flow"]) {
      expect(shouldAbortSend({ hasNewerInbound: true, stillBot: true, action, blocksSent: 0 })).toBe("stop_all");
    }
  });

  it("qualify interrompido por mensagem nova no meio do roteiro: para os blocos, mas qualifica", () => {
    expect(shouldAbortSend({ hasNewerInbound: true, stillBot: true, action: "qualify", blocksSent: 1 }))
      .toBe("stop_blocks_run_action");
  });

  it("outras ações terminais no meio da resposta também rodam", () => {
    for (const action of ["disqualify", "handoff", "resolve"]) {
      expect(shouldAbortSend({ hasNewerInbound: true, stillBot: true, action, blocksSent: 3 }))
        .toBe("stop_blocks_run_action");
    }
  });

  it("continue e send_flow no meio da resposta: param (a invocação nova decide com o histórico real)", () => {
    expect(shouldAbortSend({ hasNewerInbound: true, stillBot: true, action: "continue", blocksSent: 1 }))
      .toBe("stop_all");
    expect(shouldAbortSend({ hasNewerInbound: true, stillBot: true, action: "send_flow", blocksSent: 1 }))
      .toBe("stop_all");
  });
});

// Prazo do turno e das chamadas ao cérebro (26/09/2026): antes o pior caso
// (8 s de debounce + 3 × 45 s) passava do maxDuration 120 do webhook e a
// função podia morrer sem o handoff para a Fila.

const PER_ATTEMPT = 45_000;
const attempt = (deadline: number | null, now: number) =>
  brainAttemptTimeoutMs({ perAttemptMs: PER_ATTEMPT, deadline, now, minAttemptMs: BRAIN_MIN_ATTEMPT_MS });

describe("brainAttemptTimeoutMs", () => {
  it("sem prazo: vale o timeout por tentativa", () => {
    expect(attempt(null, 999_999)).toBe(PER_ATTEMPT);
  });

  it("com folga no prazo: timeout cheio", () => {
    expect(attempt(100_000, 8_000)).toBe(PER_ATTEMPT);
  });

  it("perto do fim do prazo: encurta a tentativa para o que sobra", () => {
    expect(attempt(100_000, 80_000)).toBe(20_000);
  });

  it("sobra menos que o mínimo útil: não tenta de novo", () => {
    expect(attempt(100_000, 91_000)).toBeNull();
    expect(attempt(100_000, 100_000)).toBeNull();
    expect(attempt(100_000, 120_000)).toBeNull();
  });

  it("pior caso com o micro fora do ar (3 × abort de 45 s): a 3ª tentativa não cabe e o handoff sai antes de 120 s", () => {
    const start = 0;
    const deadline = start + BOT_TURN_BUDGET_MS;
    let now = start + BURST_DEBOUNCE_MS;
    const t1 = attempt(deadline, now)!;
    now += t1 + 1_000; // abort + BOT_RETRY_DELAY_MS
    const t2 = attempt(deadline, now)!;
    now += t2 + 1_000;
    expect(t1).toBe(PER_ATTEMPT);
    expect(t2).toBe(PER_ATTEMPT);
    expect(attempt(deadline, now)).toBeNull();
    expect(now).toBeLessThan(120_000);
  });

  it("pior caso com o micro respondendo 504 no orçamento (42 s): 2 tentativas e handoff em ~94 s", () => {
    const deadline = BOT_TURN_BUDGET_MS;
    let now = BURST_DEBOUNCE_MS;
    const budget = microBudgetMs(attempt(deadline, now)!);
    now += budget + 1_000;
    now += microBudgetMs(attempt(deadline, now)!) + 1_000;
    expect(budget).toBe(42_000);
    expect(now).toBe(94_000);
    expect(attempt(deadline, now)).toBeNull();
  });
});

describe("microBudgetMs", () => {
  it("dá ao micro a tentativa menos a folga, para ele responder 504 antes do abort do CRM", () => {
    expect(microBudgetMs(45_000)).toBe(45_000 - BRAIN_BUDGET_MARGIN_MS);
    expect(microBudgetMs(20_000)).toBe(17_000);
  });

  it("nunca manda orçamento menor que 1 s", () => {
    expect(microBudgetMs(2_000)).toBe(1_000);
    expect(microBudgetMs(0)).toBe(1_000);
  });
});

describe("isBrainTimeoutError", () => {
  it("abort do CRM (AbortError) é timeout", () => {
    const err = new Error("This operation was aborted");
    err.name = "AbortError";
    expect(isBrainTimeoutError(err)).toBe(true);
  });

  it("504 do micro e prazo do turno (brainTimeoutError) são timeout", () => {
    expect(isBrainTimeoutError(brainTimeoutError("chatbot HTTP 504: prazo do CRM esgotado"))).toBe(true);
  });

  it("erro comum, HTTP 500 e não-Error não são timeout", () => {
    expect(isBrainTimeoutError(new Error("chatbot HTTP 500: Erro interno"))).toBe(false);
    expect(isBrainTimeoutError("AbortError")).toBe(false);
    expect(isBrainTimeoutError(null)).toBe(false);
  });

  it("TimeoutError de outra chamada do turno (AbortSignal.timeout) não vira demora do cérebro", () => {
    const err = new Error("The operation was aborted due to timeout");
    err.name = "TimeoutError";
    expect(isBrainTimeoutError(err)).toBe(false);
  });
});

describe("settleWithin", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("promessa que termina no prazo: true", async () => {
    await expect(settleWithin(Promise.resolve("ok"), 1_000)).resolves.toBe(true);
  });

  it("promessa que rejeita no prazo também conta como terminada (nunca rejeita)", async () => {
    await expect(settleWithin(Promise.reject(new Error("falhou")), 1_000)).resolves.toBe(true);
  });

  it("prazo vence antes: false", async () => {
    vi.useFakeTimers();
    const never = new Promise(() => {});
    const result = settleWithin(never, 6_000);
    await vi.advanceTimersByTimeAsync(6_000);
    await expect(result).resolves.toBe(false);
  });

  it("termina um pouco antes do prazo: true", async () => {
    vi.useFakeTimers();
    const slow = new Promise((r) => setTimeout(r, 5_000));
    const result = settleWithin(slow, 6_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await expect(result).resolves.toBe(true);
  });
});

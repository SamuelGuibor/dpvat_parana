import { describe, expect, it } from "vitest";
import { isBrBusinessHour } from "@/app/_shared/utils/date-br";
import {
  META_WINDOW_MS,
  PENDING_HANDOFF_MARGIN_MS,
  PENDING_MIN_ANSWER_MS,
  PENDING_NUDGE_GAP_MS,
  pendingHandoffReason,
  planPendingFollowup,
  type PendingPlanInput,
} from "@/app/_shared/utils/pending-followup";

// Cobrança do pedido em aberto (decisão 2 do dono, 30/09/2026): de 6 em 6 h
// com a janela de 24 h da Meta aberta, só das 7h às 21h, e transferência ao
// dono 2 h antes de a janela fechar (ou na 1ª rodada depois disso, à noite).

const MIN = 60_000;
const HOUR = 60 * MIN;
// Brasília = UTC−3 (sem horário de verão desde 2019).
const brt = (day: number, hour: number, minute = 0) => Date.UTC(2026, 9, day, hour + 3, minute);
const always = () => true;

function input(over: Partial<PendingPlanInput> & { now: number }): PendingPlanInput {
  const lastInboundAt = new Date(brt(1, 10));
  return {
    lastInboundAt,
    lastMessageAt: lastInboundAt,
    collectNudgeAt: null,
    collectNudgeCount: 0,
    lastFailedAt: null,
    isBusinessHour: always,
    ...over,
  };
}

describe("planPendingFollowup", () => {
  it("espera antes de 6 h de silêncio e cobra com 6 h (attempt = cobranças + 1)", () => {
    expect(planPendingFollowup(input({ now: brt(1, 15, 59) })).kind).toBe("wait");
    const plan = planPendingFollowup(input({ now: brt(1, 16), collectNudgeCount: 1 }));
    expect(plan).toMatchObject({ kind: "nudge", attempt: 2 });
    if (plan.kind === "nudge") {
      expect(plan.windowClosesAt.getTime()).toBe(brt(1, 10) + META_WINDOW_MS);
      expect(plan.handoffAt.getTime()).toBe(brt(1, 10) + META_WINDOW_MS - PENDING_HANDOFF_MARGIN_MS);
    }
  });

  it("a resposta do cliente ('mando depois') empurra a próxima cobrança", () => {
    const reply = new Date(brt(1, 14));
    const plan = planPendingFollowup(input({ now: brt(1, 17), lastInboundAt: reply, lastMessageAt: reply }));
    expect(plan.kind).toBe("wait");
    expect(planPendingFollowup(input({ now: brt(1, 20), lastInboundAt: reply, lastMessageAt: reply })).kind).toBe("nudge");
  });

  it("silent tem backoff: conta 6 h desde a última avaliação (collectNudgeAt)", () => {
    const plan = planPendingFollowup(input({ now: brt(1, 18), collectNudgeAt: new Date(brt(1, 16)) }));
    expect(plan).toMatchObject({ kind: "wait", why: "gap" });
    if (plan.kind === "wait") expect(plan.until.getTime()).toBe(brt(1, 22));
  });

  it("falha do cérebro (ou micro antigo) tenta de novo só depois de 1 h", () => {
    const plan = planPendingFollowup(input({ now: brt(1, 16, 30), lastFailedAt: new Date(brt(1, 16)) }));
    expect(plan).toMatchObject({ kind: "wait", why: "retry" });
    expect(planPendingFollowup(input({ now: brt(1, 17), lastFailedAt: new Date(brt(1, 16)) })).kind).toBe("nudge");
  });

  it("fora do horário comercial espera (a fase também nem roda)", () => {
    const plan = planPendingFollowup(input({ now: brt(1, 16), isBusinessHour: () => false }));
    expect(plan).toMatchObject({ kind: "wait", why: "off_hours" });
  });

  it("não cobra se faltam menos de 2 h para a transferência", () => {
    const handoffAt = brt(1, 10) + META_WINDOW_MS - PENDING_HANDOFF_MARGIN_MS;
    const plan = planPendingFollowup(input({ now: handoffAt - PENDING_MIN_ANSWER_MS + MIN }));
    expect(plan).toMatchObject({ kind: "wait", why: "too_close" });
    expect(planPendingFollowup(input({ now: handoffAt - PENDING_MIN_ANSWER_MS })).kind).toBe("nudge");
  });

  it("transfere 2 h antes de a janela fechar; depois de fechar, marca a janela como fechada", () => {
    const closesAt = brt(1, 10) + META_WINDOW_MS;
    expect(planPendingFollowup(input({ now: closesAt - PENDING_HANDOFF_MARGIN_MS - 1 })).kind).not.toBe("handoff");
    expect(planPendingFollowup(input({ now: closesAt - PENDING_HANDOFF_MARGIN_MS }))).toEqual({
      kind: "handoff", windowClosed: false, windowClosesAt: new Date(closesAt),
    });
    expect(planPendingFollowup(input({ now: closesAt + HOUR }))).toMatchObject({ kind: "handoff", windowClosed: true });
  });

  it("cliente que nunca escreveu: espera ele escrever (nada a cobrar nem a transferir)", () => {
    expect(planPendingFollowup(input({ now: brt(1, 12), lastInboundAt: null }))).toMatchObject({
      kind: "wait", why: "awaiting_client",
    });
  });

  it("Devolver com a janela já fechada: espera o cliente, não volta à Fila", () => {
    // Cliente às 10h do dia 1; atendente devolve às 11h do dia 2 (janela fechou às 10h).
    const plan = planPendingFollowup(input({ now: brt(2, 11, 15), requestSince: new Date(brt(2, 11)) }));
    expect(plan).toMatchObject({ kind: "wait", why: "awaiting_client" });
  });

  it("Devolver a menos de 2 h do fechamento também espera (sem pingue-pongue com a Fila)", () => {
    const handoffAt = brt(1, 10) + META_WINDOW_MS - PENDING_HANDOFF_MARGIN_MS;
    expect(planPendingFollowup(input({ now: handoffAt + 30 * MIN, requestSince: new Date(handoffAt + 15 * MIN) })).kind)
      .toBe("wait");
    // Devolvido antes da margem: a transferência sai normalmente na margem.
    expect(planPendingFollowup(input({ now: handoffAt + 30 * MIN, requestSince: new Date(handoffAt - HOUR) })).kind)
      .toBe("handoff");
  });

  it("cliente escreve depois do Devolver: a janela nova manda de novo (cobra em 6 h)", () => {
    const reply = new Date(brt(2, 14));
    const plan = planPendingFollowup(input({
      now: brt(2, 20), lastInboundAt: reply, lastMessageAt: reply, requestSince: new Date(brt(2, 11)),
    }));
    expect(plan.kind).toBe("nudge");
  });
});

/**
 * Simula o cron de 15 em 15 min (fase só das 7h às 21h, como o runNudgePhase)
 * a partir da última mensagem do cliente. Cada cobrança atualiza lastMessageAt
 * e collectNudgeAt, como o envio + o updateMany da fase 0.
 */
function simulate(lastInboundMs: number) {
  const lastInboundAt = new Date(lastInboundMs);
  let lastMessageAt = lastInboundAt;
  let collectNudgeAt: Date | null = null;
  const nudges: number[] = [];
  let handoff: { at: number; windowClosed: boolean } | null = null;
  const start = Math.ceil((lastInboundMs + 30 * MIN) / (15 * MIN)) * 15 * MIN;
  for (let t = start; t < lastInboundMs + 3 * META_WINDOW_MS && !handoff; t += 15 * MIN) {
    if (!isBrBusinessHour(t)) continue;
    const plan = planPendingFollowup({
      now: t, lastInboundAt, lastMessageAt, collectNudgeAt, collectNudgeCount: nudges.length, isBusinessHour: isBrBusinessHour,
    });
    if (plan.kind === "nudge") {
      nudges.push(t);
      lastMessageAt = new Date(t);
      collectNudgeAt = new Date(t);
    } else if (plan.kind === "handoff") {
      handoff = { at: t, windowClosed: plan.windowClosed };
    }
  }
  return { nudges, handoff };
}

describe("simulação da janela (relógio de 15 min, horário comercial real)", () => {
  for (let hour = 0; hour < 24; hour++) {
    it(`cliente às ${String(hour).padStart(2, "0")}h: no máximo 3 cobranças, nunca à noite, sempre uma transferência`, () => {
      const inbound = brt(1, hour);
      const closesAt = inbound + META_WINDOW_MS;
      const handoffAt = closesAt - PENDING_HANDOFF_MARGIN_MS;
      const { nudges, handoff } = simulate(inbound);

      expect(nudges.length).toBeLessThanOrEqual(3);
      for (const [i, t] of nudges.entries()) {
        expect(isBrBusinessHour(t)).toBe(true);
        expect(handoffAt - t).toBeGreaterThanOrEqual(PENDING_MIN_ANSWER_MS);
        if (i > 0) expect(t - nudges[i - 1]).toBeGreaterThanOrEqual(PENDING_NUDGE_GAP_MS);
      }
      expect(handoff).not.toBeNull();
      if (!handoff) return;
      expect(handoff.at).toBeGreaterThanOrEqual(handoffAt);
      // Existindo rodada em horário comercial entre a margem e o fechamento, a
      // transferência sai com a janela ainda aberta; senão, na 1ª rodada da manhã.
      let firstRound = Math.ceil(handoffAt / (15 * MIN)) * 15 * MIN;
      while (!isBrBusinessHour(firstRound)) firstRound += 15 * MIN;
      expect(handoff.at).toBe(firstRound);
      expect(handoff.windowClosed).toBe(firstRound >= closesAt);
    });
  }

  it("cliente às 10h: cobra às 16h, não cobra às 7h (transferência em 1 h) e transfere às 8h", () => {
    const { nudges, handoff } = simulate(brt(1, 10));
    expect(nudges).toEqual([brt(1, 16)]);
    expect(handoff).toEqual({ at: brt(2, 8), windowClosed: false });
  });

  it("cliente às 23h: a margem cai às 21h (fora do horário) e a transferência sai às 7h, com a janela já fechada", () => {
    const { handoff } = simulate(brt(1, 23));
    expect(handoff).toEqual({ at: brt(3, 7), windowClosed: true });
  });
});

describe("pendingHandoffReason", () => {
  const now = brt(2, 8);

  it("janela fechando, com o que falta", () => {
    expect(pendingHandoffReason({
      trigger: "window", missing: "CTPS digital; resultado da perícia", nudges: 2,
      windowClosed: false, windowClosesAt: new Date(brt(2, 10)), now,
    })).toBe(
      "pedido em aberto incompleto: faltam CTPS digital; resultado da perícia — o cliente não respondeu " +
      "(2 cobranças automáticas) e a janela de 24 h da Meta fecha às 10:00",
    );
  });

  it("janela já fechada, sem saber o que falta", () => {
    expect(pendingHandoffReason({ trigger: "window", nudges: 1, windowClosed: true, windowClosesAt: new Date(brt(1, 23)), now })).toBe(
      "pedido em aberto sem resposta do cliente (1 cobrança automática) — a janela de 24 h da Meta já fechou (só template); conferir o que falta",
    );
  });

  it("janela que fecha em outro dia leva a data", () => {
    expect(pendingHandoffReason({ trigger: "window", nudges: 0, windowClosesAt: new Date(brt(3, 9, 30)), now })).toContain(
      "fecha em 03/10 às 09:30",
    );
  });

  it("transferência decidida pela IA da cobrança", () => {
    expect(pendingHandoffReason({ trigger: "ai", missing: "laudo", nudges: 1, aiReason: "cliente diz que não consegue baixar" })).toBe(
      "pedido em aberto: faltam laudo — cliente diz que não consegue baixar",
    );
    expect(pendingHandoffReason({ trigger: "ai", nudges: 0, aiReason: "" })).toBe(
      "pedido em aberto: a IA da cobrança encerrou a coleta — conferir o que chegou",
    );
  });
});

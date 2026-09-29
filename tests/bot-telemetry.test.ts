import { describe, expect, it } from "vitest";
import {
  conversationAgeOf, discardOutcomeOf, isDiscardedOutcome, queueEffective, sumUsageByModel, turnTimings,
} from "@/app/_shared/utils/bot-telemetry";
import { BURST_DEBOUNCE_MS, newerInboundWhere } from "@/app/_shared/utils/bot-timing";
import { modelLabel, priceFor, usageCostUSD } from "@/app/_shared/lib/ai-pricing";

// Telemetria do bot (whatsapp/bot.ts, painel do chatbot e Canto da IA). Até
// 26/09/2026 o único tempo do log era a idade da conversa (durationMs), a
// resposta descartada não deixava rastro e a transcrição do Gemini não tinha
// custo em lugar nenhum.

describe("conversationAgeOf", () => {
  it("lê conversationAgeMs e cai no durationMs dos logs antigos", () => {
    expect(conversationAgeOf({ conversationAgeMs: 5 })).toBe(5);
    expect(conversationAgeOf({ durationMs: 7 })).toBe(7);
    expect(conversationAgeOf({ conversationAgeMs: 5, durationMs: 7 })).toBe(5);
  });

  it("sem número finito devolve null (mesma régua do CASE do SQL)", () => {
    expect(conversationAgeOf({})).toBeNull();
    expect(conversationAgeOf(null)).toBeNull();
    expect(conversationAgeOf([])).toBeNull();
    expect(conversationAgeOf({ conversationAgeMs: "5" })).toBeNull();
    expect(conversationAgeOf({ conversationAgeMs: "5", durationMs: 7 })).toBe(7);
    expect(conversationAgeOf({ durationMs: Number.NaN })).toBeNull();
  });
});

describe("isDiscardedOutcome / discardOutcomeOf", () => {
  it("só os outcomes discarded_* são descarte", () => {
    expect(isDiscardedOutcome("discarded_race")).toBe(true);
    expect(isDiscardedOutcome("discarded_status")).toBe(true);
    expect(isDiscardedOutcome("continue")).toBe(false);
    expect(isDiscardedOutcome("error")).toBe(false);
    expect(isDiscardedOutcome(undefined)).toBe(false);
  });

  it("conversa fora do modo bot vence a mensagem nova do cliente", () => {
    expect(discardOutcomeOf({ stillBot: false })).toBe("discarded_status");
    expect(discardOutcomeOf({ stillBot: true })).toBe("discarded_race");
  });
});

describe("queueEffective", () => {
  it("fila que moveu = queued; que não moveu (atendente já tinha a conversa) = skipped", () => {
    expect(queueEffective(true, "IA devolveu resposta vazia")).toEqual({ status: "queued", reason: "IA devolveu resposta vazia" });
    expect(queueEffective(false, "transferido pelo bot")).toEqual({ status: "skipped", reason: "transferido pelo bot" });
  });
});

describe("turnTimings", () => {
  it("latência conta desde o início do turno (debounce incluso) e desde a mensagem do cliente", () => {
    expect(turnTimings({ startedAt: 1_000, inboundAt: 500, firstSentAt: 21_000, brainMs: 9_400.4, now: 25_000 }))
      .toEqual({ botLatencyMs: 20_000, sinceInboundMs: 20_500, brainMs: 9_400, totalMs: 24_000 });
  });

  it("turno sem mensagem enviada (silêncio, descarte) não tem latência, só duração", () => {
    expect(turnTimings({ startedAt: 1_000, inboundAt: 500, firstSentAt: null, brainMs: 0, now: 9_000 }))
      .toEqual({ brainMs: 0, totalMs: 8_000 });
  });

  it("createdAt ilegível da mensagem não vira NaN no log", () => {
    const t = turnTimings({ startedAt: 1_000, inboundAt: Number.NaN, firstSentAt: 3_000, brainMs: 0, now: 4_000 });
    expect(t).toEqual({ botLatencyMs: 2_000, brainMs: 0, totalMs: 3_000 });
  });
});

describe("sumUsageByModel", () => {
  it("junta por modelo sem misturar Claude e Gemini", () => {
    const out = sumUsageByModel([
      { model: "gemini-2.5-flash-audio", inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
      { model: "claude-sonnet-5", inputTokens: 1_000, outputTokens: 50, cacheReadTokens: 900, cacheWriteTokens: 5 },
      { model: "gemini-2.5-flash-audio", inputTokens: 200, outputTokens: 20, cacheReadTokens: 3, cacheWriteTokens: 0 },
    ]);
    expect(out).toEqual([
      { model: "gemini-2.5-flash-audio", inputTokens: 300, outputTokens: 30, cacheReadTokens: 3, cacheWriteTokens: 0 },
      { model: "claude-sonnet-5", inputTokens: 1_000, outputTokens: 50, cacheReadTokens: 900, cacheWriteTokens: 5 },
    ]);
  });

  it("ignora item sem modelo, que não é objeto, e token que não é número", () => {
    expect(sumUsageByModel([null, 3, { inputTokens: 5 }, { model: "", inputTokens: 1 }])).toEqual([]);
    expect(sumUsageByModel(undefined)).toEqual([]);
    expect(sumUsageByModel([{ model: "x", inputTokens: "9", outputTokens: 2 }])).toEqual([
      { model: "x", inputTokens: 0, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 0 },
    ]);
  });
});

describe("preço da transcrição (MODEL_PRICING)", () => {
  it("o sufixo -audio casa com a chave de áudio, antes da de texto", () => {
    expect(priceFor("gemini-2.5-flash-audio")).toMatchObject({ known: true, price: { input: 1, output: 2.5 } });
    expect(priceFor("gemini-2.5-flash")).toMatchObject({ known: true, price: { input: 0.3, output: 2.5 } });
    expect(priceFor("gemini-2.5-flash-lite")).toMatchObject({ known: true, price: { input: 0.1 } });
    expect(modelLabel("gemini-2.5-flash-audio")).toBe("Gemini 2.5 Flash (áudio)");
  });

  it("1M de tokens de áudio custa US$ 1 de entrada", () => {
    expect(usageCostUSD({ model: "gemini-2.5-flash-audio", inputTokens: 1_000_000, outputTokens: 0 })).toBeCloseTo(1, 6);
  });
});

describe("newerInboundWhere", () => {
  it("mensagem mais nova do cliente, com desempate por id no mesmo milissegundo", () => {
    const at = "2026-09-26T12:00:00.000Z";
    expect(newerInboundWhere("c1", { id: "m5", createdAt: at })).toEqual({
      contactId: "c1",
      direction: "in",
      deletedAt: null,
      id: { not: "m5" },
      OR: [
        { createdAt: { gt: new Date(at) } },
        { createdAt: new Date(at), id: { gt: "m5" } },
      ],
    });
  });

  it("o debounce da rajada é o mesmo para o bot e para a ficha (8 s)", () => {
    expect(BURST_DEBOUNCE_MS).toBe(8_000);
  });
});

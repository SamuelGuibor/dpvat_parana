import { describe, expect, it } from "vitest";
import { modelLabel, priceFor, usageCostUSD, usageTokens } from "@/app/_shared/lib/ai-pricing";
import { brDayKey, brStartOfDay } from "@/app/_shared/utils/date-br";
import {
  aiPeriodBounds,
  buildAiCorner,
  type AiOperation,
  type AiPeriodBounds,
  type AiUsageGroup,
} from "@/app/_shared/utils/ai-corner-agg";

// Canto da IA agregado em SQL: o Postgres devolve grupos por ação × modelo ×
// hora UTC e buildAiCorner monta o extrato do PERÍODO escolhido no painel. Os
// testes comparam com a soma chamada a chamada (um log por vez) sobre as
// mesmas chamadas sintéticas.

type Call = {
  action: string;
  createdAt: Date;
  usage: {
    model?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
};

const NAMES = {
  labels: { wa_bot: "Bot do WhatsApp", wa_suggest: "Sugestão de resposta", ai_audit: "Auditoria de documentos" },
  icons: { wa_bot: "bot", wa_suggest: "message", ai_audit: "shield" },
};

// ─── Soma chamada a chamada, para comparar ─────────────────────────────────

function perCallWindow(from: Date, to: Date, calls: Call[]) {
  const rows = [...calls].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const ops = new Map<string, AiOperation>();
  let usd = 0;
  let tokens = 0;
  let runs = 0;
  for (const row of rows) {
    if (row.createdAt < from || row.createdAt > to) continue;
    const u = row.usage;
    const op: AiOperation = ops.get(row.action) ?? {
      action: row.action,
      label: (NAMES.labels as Record<string, string>)[row.action] ?? row.action,
      icon: (NAMES.icons as Record<string, string>)[row.action] ?? "sparkles",
      runs: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      tokens: 0, usd: 0, models: [], estimated: false,
    };
    const cost = usageCostUSD(u);
    const tok = usageTokens(u);
    op.runs += 1;
    op.usd += cost;
    op.tokens += tok;
    op.inputTokens += u.inputTokens ?? 0;
    op.outputTokens += u.outputTokens ?? 0;
    op.cacheReadTokens += u.cacheReadTokens ?? 0;
    op.cacheWriteTokens += u.cacheWriteTokens ?? 0;
    const m = modelLabel(u.model);
    if (u.model && !op.models.includes(m)) op.models.push(m);
    if (!priceFor(u.model).known) op.estimated = true;
    ops.set(row.action, op);
    usd += cost;
    tokens += tok;
    runs += 1;
  }
  return { usd, tokens, runs, ops };
}

// ─── O que o SQL faz: GROUP BY ação × modelo × hora UTC, ORDER BY min(createdAt)

function groupLikeSql(calls: Call[], b: AiPeriodBounds): AiUsageGroup[] {
  const groups = new Map<string, { g: AiUsageGroup; first: number }>();
  for (const c of calls) {
    if (c.createdAt < b.since || c.createdAt > b.until) continue;
    const hour = new Date(Math.floor(c.createdAt.getTime() / 3_600_000) * 3_600_000);
    const model = c.usage.model ?? null;
    const key = `${c.action}|${model}|${hour.toISOString()}`;
    const entry = groups.get(key) ?? {
      g: {
        action: c.action, model, hour, runs: 0,
        inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
      },
      first: c.createdAt.getTime(),
    };
    entry.g.runs += 1;
    entry.g.inputTokens += c.usage.inputTokens ?? 0;
    entry.g.outputTokens += c.usage.outputTokens ?? 0;
    entry.g.cacheReadTokens += c.usage.cacheReadTokens ?? 0;
    entry.g.cacheWriteTokens += c.usage.cacheWriteTokens ?? 0;
    entry.first = Math.min(entry.first, c.createdAt.getTime());
    groups.set(key, entry);
  }
  return [...groups.values()].sort((a, b2) => a.first - b2.first).map((e) => e.g);
}

/** Gerador determinístico (mulberry32) para as chamadas sintéticas. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ACTIONS = ["wa_bot", "wa_bot", "wa_bot", "wa_suggest", "wa_ficha_ai", "ai_audit", "acao_nova"];
const MODELS: (string | null | undefined)[] = [
  "claude-sonnet-5", "claude-sonnet-5-20260101", "claude-haiku-4-5", "gemini-2.0-flash-lite",
  "claude-opus-4-8", "claude-opus-5-5", null, undefined, "modelo-que-nao-existe",
];

// 02h e 03h UTC = 23h e 00h de Brasília: concentra chamadas na virada do dia.
const HOURS_UTC = [2, 3, 14, 20];

function syntheticCalls(now: Date, n: number, seed: number, spanDays = 120): Call[] {
  const r = rng(seed);
  const calls: Call[] = [];
  const dayMs = 86_400_000;
  const base = Math.floor(now.getTime() / dayMs) * dayMs - spanDays * dayMs;
  while (calls.length < n) {
    const day = Math.floor(r() * (spanDays + 1));
    const hour = HOURS_UTC[Math.floor(r() * HOURS_UTC.length)];
    const t = base + day * dayMs + hour * 3_600_000 + Math.floor(r() * 3_600_000);
    if (t > now.getTime()) continue;
    const model = MODELS[Math.floor(r() * MODELS.length)];
    const usage: Call["usage"] = { inputTokens: Math.floor(r() * 5000) };
    if (model !== undefined) usage.model = model;
    if (r() > 0.1) usage.outputTokens = Math.floor(r() * 800);
    if (r() > 0.3) usage.cacheReadTokens = Math.floor(r() * 20000);
    if (r() > 0.5) usage.cacheWriteTokens = Math.floor(r() * 3000);
    calls.push({ action: ACTIONS[Math.floor(r() * ACTIONS.length)], createdAt: new Date(t), usage });
  }
  return calls;
}

// Calendário do dashboard: início do 1º dia e fim (23:59:59.999) do último, em Brasília.
function brRange(fromDay: string, toDay: string) {
  const from = brStartOfDay(new Date(`${fromDay}T15:00:00Z`));
  const to = new Date(brStartOfDay(new Date(`${toDay}T15:00:00Z`)).getTime() + 86_400_000 - 1);
  return { fromISO: from.toISOString(), toISO: to.toISOString() };
}

describe("aiPeriodBounds", () => {
  it("atalho de N dias começa à meia-noite de Brasília de N-1 dias atrás", () => {
    // 30/09 22:30 BRT = 01/10 01:30Z: o servidor em UTC já virou o dia.
    const now = new Date("2026-10-01T01:30:00Z");
    const b = aiPeriodBounds({ days: 7 }, now);
    expect(b.from.toISOString()).toBe("2026-09-24T03:00:00.000Z");
    expect(b.to).toEqual(now);
    expect(b.todayStart.toISOString()).toBe("2026-09-30T03:00:00.000Z");
  });

  it("período antigo ainda lê o dia de hoje (para o card 'Hoje')", () => {
    const now = new Date("2026-10-01T15:00:00Z");
    const b = aiPeriodBounds(brRange("2026-09-01", "2026-09-30"), now);
    expect(b.since.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(b.until).toEqual(now);
  });

  it("período invertido ou data inválida é erro", () => {
    expect(() => aiPeriodBounds({ fromISO: "2026-09-30T03:00:00Z", toISO: "2026-09-01T03:00:00Z" })).toThrow();
    expect(() => aiPeriodBounds({ fromISO: "ontem" })).toThrow();
  });
});

describe("buildAiCorner", () => {
  it("somar por grupo de hora/modelo dá o mesmo usd, tokens e runs que somar chamada a chamada", () => {
    // [agora, período, semente, dias de chamadas sintéticas antes de agora]
    const cases: [string, { fromISO?: string; toISO?: string; days?: number }, number, number][] = [
      ["2026-09-25T15:00:00Z", { days: 30 }, 1, 40],
      ["2026-10-01T01:30:00Z", { days: 7 }, 2, 10], // 22h30 BRT do último dia do mês
      ["2026-10-01T15:00:00Z", brRange("2026-09-01", "2026-09-30"), 3, 40], // "mês passado"
      ["2026-10-01T15:00:00Z", { days: 90 }, 4, 100], // série por mês
    ];
    for (const [nowIso, opts, seed, span] of cases) {
      const now = new Date(nowIso);
      const calls = syntheticCalls(now, span * 300, seed, span);
      const b = aiPeriodBounds(opts, now);
      const groups = groupLikeSql(calls, b);
      // Os grupos precisam de fato juntar chamadas, senão o teste não prova nada.
      expect(groups.length).toBeLessThan(calls.length / 2);

      const got = buildAiCorner(groups, NAMES, b, now);
      const want = perCallWindow(b.from, b.to, calls);
      expect(got.runs).toBe(want.runs);
      expect(got.tokens).toBe(want.tokens);
      expect(Math.abs(got.usd - want.usd)).toBeLessThanOrEqual(0.0001);
      expect(got.operations.map((o) => o.action).sort()).toEqual([...want.ops.keys()].sort());
      for (const wo of want.ops.values()) {
        const go = got.operations.find((o) => o.action === wo.action)!;
        expect(go.runs).toBe(wo.runs);
        expect(go.tokens).toBe(wo.tokens);
        expect(go.models).toEqual(wo.models);
        expect(go.estimated).toBe(wo.estimated);
        expect(Math.abs(go.usd - wo.usd)).toBeLessThanOrEqual(0.0001);
      }
      // A série soma o mesmo que o total do período.
      const seriesSum = got.series.reduce((a, s) => a + s.usd, 0);
      expect(Math.abs(seriesSum - got.usd)).toBeLessThanOrEqual(0.0001 * got.series.length + 0.0001);

      const today = perCallWindow(b.todayStart, now, calls);
      expect(got.today.runs).toBe(today.runs);
      expect(Math.abs(got.today.usd - today.usd)).toBeLessThanOrEqual(0.0001);
    }
  });

  it("limites do período no fuso de Brasília: 23:59 BRT do último dia entra, 00:00 do dia seguinte não", () => {
    const now = new Date("2026-10-01T15:00:00Z");
    const b = aiPeriodBounds(brRange("2026-09-01", "2026-09-30"), now);
    const calls: Call[] = [
      { action: "wa_bot", createdAt: new Date("2026-09-01T02:59:59Z"), usage: { model: "claude-sonnet-5", inputTokens: 1_000_000 } }, // 31/08 23:59 BRT
      { action: "wa_bot", createdAt: new Date("2026-09-01T03:00:00Z"), usage: { model: "claude-sonnet-5", inputTokens: 1_000_000 } }, // 01/09 00:00 BRT
      { action: "wa_bot", createdAt: new Date("2026-10-01T02:59:00Z"), usage: { model: "claude-sonnet-5", outputTokens: 1_000_000 } }, // 30/09 23:59 BRT
      { action: "wa_bot", createdAt: new Date("2026-10-01T03:00:00Z"), usage: { model: "claude-sonnet-5", outputTokens: 1_000_000 } }, // 01/10 00:00 BRT
    ];
    const got = buildAiCorner(groupLikeSql(calls, b), NAMES, b, now);
    expect(got.runs).toBe(2);
    expect(got.days).toBe(30);
    expect(got.seriesUnit).toBe("dia");
    expect(got.series).toHaveLength(30);
    // Sonnet 5: US$ 2 por 1M de entrada, US$ 10 por 1M de saída.
    expect(got.series[0]).toEqual({ key: "2026-09-01", label: "01/09", usd: 2 });
    expect(got.series[29]).toEqual({ key: "2026-09-30", label: "30/09", usd: 10 });
    expect(got.today).toEqual({ usd: 10, tokens: 1_000_000, runs: 1 });
  });

  it("período longo vira série por mês e média por dia usa os dias até hoje", () => {
    const now = new Date("2026-10-01T15:00:00Z");
    const b = aiPeriodBounds(brRange("2026-08-01", "2026-10-31"), now);
    const got = buildAiCorner([], NAMES, b, now);
    expect(got.seriesUnit).toBe("mês");
    expect(got.series.map((s) => s.label)).toEqual(["ago/26", "set/26", "out/26"]);
    expect(got.days).toBe(62); // 01/08 → 01/10 (o resto de outubro ainda não aconteceu)
  });

  it("custo por decisão do bot é só o wa_bot — roteiro e descartadas não entram", () => {
    const now = new Date("2026-09-25T15:00:00Z");
    const b = aiPeriodBounds({ days: 7 }, now);
    const at = new Date("2026-09-25T12:00:00Z");
    const calls: Call[] = [
      { action: "wa_bot", createdAt: at, usage: { model: "claude-sonnet-5", inputTokens: 1_000_000 } },
      { action: "wa_bot", createdAt: at, usage: { model: "claude-sonnet-5", inputTokens: 1_000_000 } },
      { action: "wa_bot_discarded", createdAt: at, usage: { model: "claude-sonnet-5", inputTokens: 1_000_000 } },
      { action: "roteiro_ai", createdAt: at, usage: { model: "claude-sonnet-5", outputTokens: 1_000_000 } },
    ];
    const got = buildAiCorner(groupLikeSql(calls, b), NAMES, b, now);
    expect(got.usd).toBe(16);
    expect(got.costPerBotDecision).toBe(2);
  });

  it("modelo nulo ou fora da tabela marca 'estimado' e não entra na lista de modelos", () => {
    const now = new Date("2026-09-25T15:00:00Z");
    const b = aiPeriodBounds({ days: 1 }, now);
    const calls: Call[] = [
      { action: "acao_nova", createdAt: new Date("2026-09-25T10:00:00Z"), usage: { inputTokens: 10 } },
      { action: "wa_suggest", createdAt: new Date("2026-09-25T10:05:00Z"), usage: { model: "claude-haiku-4-5", inputTokens: 10 } },
    ];
    const got = buildAiCorner(groupLikeSql(calls, b), NAMES, b, now, true);
    const nova = got.operations.find((o) => o.action === "acao_nova")!;
    expect(nova.estimated).toBe(true);
    expect(nova.models).toEqual([]);
    expect(nova.label).toBe("acao_nova");
    expect(nova.icon).toBe("sparkles");
    const sug = got.operations.find((o) => o.action === "wa_suggest")!;
    expect(sug.estimated).toBe(false);
    expect(sug.models).toEqual(["Haiku 4.5"]);
    expect(got.costPerBotDecision).toBeNull();
    expect(got.numberFiltered).toBe(true);
    expect(brDayKey(new Date(got.fromISO))).toBe("2026-09-25");
  });
});

describe("preços da tabela", () => {
  it("chave específica vence a genérica e o cache de leitura usa o preço próprio do modelo", () => {
    expect(priceFor("claude-sonnet-5").price).toMatchObject({ input: 2, output: 10 });
    expect(modelLabel("claude-opus-5-5")).toBe("Opus 5.5");
    expect(modelLabel("claude-opus-5")).toBe("Opus 5");
    // Opus 5.5: cache lido a US$ 0,20 por 1M (não 0,1 × 4).
    expect(usageCostUSD({ model: "claude-opus-5-5", cacheReadTokens: 1_000_000 })).toBeCloseTo(0.2, 10);
    // Sem cacheRead próprio: 0,1 × input.
    expect(usageCostUSD({ model: "claude-haiku-4-5", cacheReadTokens: 1_000_000 })).toBeCloseTo(0.1, 10);
  });
});

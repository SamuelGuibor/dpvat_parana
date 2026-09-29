import { describe, expect, it } from "vitest";
import { modelLabel, priceFor, usageCostUSD, usageTokens } from "@/app/_shared/lib/ai-pricing";
import {
  brDayKey, brDayKeySeries, brDaysInMonth, brDayOfMonth, brLabelFromKey,
  brStartOfDay, brStartOfDaysAgo, brStartOfMonth,
} from "@/app/_shared/utils/date-br";
import {
  aiCornerBounds,
  buildAiWindowsFromGroups,
  type AiCorner,
  type AiOperation,
  type AiUsageGroup,
} from "@/app/_shared/utils/ai-corner-agg";

// Canto da IA agregado em SQL (25/09/2026): o Postgres devolve grupos por
// ação × modelo × hora UTC e buildAiWindowsFromGroups monta as janelas. Os
// testes comparam com uma reimplementação do laço antigo, que somava chamada
// a chamada (um log por vez), sobre as mesmas chamadas sintéticas.

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

// ─── O laço antigo de getAiCorner (até 25/09/2026), para comparar ──────────

function legacyWindow(label: string, from: Date, rows: Call[]) {
  const ops = new Map<string, AiOperation>();
  let usd = 0;
  let tokens = 0;
  let runs = 0;
  for (const row of rows) {
    if (row.createdAt < from) continue;
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
  const operations = [...ops.values()]
    .map((o) => ({ ...o, usd: Math.round(o.usd * 10000) / 10000 }))
    .sort((a, b) => b.usd - a.usd);
  return { label, fromISO: from.toISOString(), usd: Math.round(usd * 10000) / 10000, tokens, runs, operations };
}

function legacyCorner(calls: Call[], now: Date): AiCorner {
  const rows = [...calls].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const monthStart = brStartOfMonth(now);
  const last30Start = brStartOfDaysAgo(29, now);
  const todayStart = brStartOfDay(now);
  const month = legacyWindow("Mês corrente", monthStart, rows);
  const last30 = legacyWindow("Últimos 30 dias", last30Start, rows);
  const todayWindow = legacyWindow("Hoje", todayStart, rows);
  const daysElapsed = brDayOfMonth(now);
  const dailyMap = new Map<string, number>();
  for (const key of brDayKeySeries(daysElapsed, now)) dailyMap.set(key, 0);
  for (const row of rows) {
    if (row.createdAt < monthStart) continue;
    const key = brDayKey(row.createdAt);
    if (dailyMap.has(key)) dailyMap.set(key, (dailyMap.get(key) ?? 0) + usageCostUSD(row.usage));
  }
  const daily = [...dailyMap.entries()].map(([date, value]) => ({
    date, label: brLabelFromKey(date), usd: Math.round(value * 10000) / 10000,
  }));
  const daysInMonth = brDaysInMonth(now);
  const monthProjectionUSD = daysElapsed > 0
    ? Math.round((month.usd / daysElapsed) * daysInMonth * 100) / 100
    : 0;
  const botDecisions = month.operations.find((o) => o.action === "wa_bot")?.runs ?? 0;
  const costPerBotDecision = botDecisions > 0 ? Math.round((month.usd / botDecisions) * 10000) / 10000 : null;
  return {
    month, last30,
    today: { usd: todayWindow.usd, tokens: todayWindow.tokens, runs: todayWindow.runs },
    monthProjectionUSD, costPerBotDecision, daily,
  };
}

// ─── O que o SQL faz: GROUP BY ação × modelo × hora UTC, ORDER BY min(createdAt)

function groupLikeSql(calls: Call[], since: Date): AiUsageGroup[] {
  const groups = new Map<string, { g: AiUsageGroup; first: number }>();
  for (const c of calls) {
    if (c.createdAt < since) continue;
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
  return [...groups.values()]
    .sort((a, b) => a.first - b.first)
    .map((e) => e.g);
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
  "claude-opus-4-8", null, undefined, "modelo-que-nao-existe",
];

// 02h e 03h UTC = 23h e 00h de Brasília: concentra chamadas na virada do dia.
const HOURS_UTC = [2, 3, 14, 20];

function syntheticCalls(now: Date, n: number, seed: number): Call[] {
  const r = rng(seed);
  const calls: Call[] = [];
  // ~40 dias antes de `now` (cobre o que fica fora das janelas), em poucas
  // horas por dia para os grupos de fato juntarem várias chamadas.
  const dayMs = 86_400_000;
  const base = Math.floor(now.getTime() / dayMs) * dayMs - 40 * dayMs;
  while (calls.length < n) {
    const day = Math.floor(r() * 41);
    const hour = HOURS_UTC[Math.floor(r() * HOURS_UTC.length)];
    const t = base + day * dayMs + hour * 3_600_000 + Math.floor(r() * 3_600_000);
    if (t > now.getTime()) continue;
    const at = new Date(t);
    const model = MODELS[Math.floor(r() * MODELS.length)];
    const usage: Call["usage"] = { inputTokens: Math.floor(r() * 5000) };
    if (model !== undefined) usage.model = model;
    if (r() > 0.1) usage.outputTokens = Math.floor(r() * 800);
    if (r() > 0.3) usage.cacheReadTokens = Math.floor(r() * 20000);
    if (r() > 0.5) usage.cacheWriteTokens = Math.floor(r() * 3000);
    calls.push({ action: ACTIONS[Math.floor(r() * ACTIONS.length)], createdAt: at, usage });
  }
  return calls;
}

function expectSameCorner(got: AiCorner, want: AiCorner) {
  for (const k of ["month", "last30"] as const) {
    const g = got[k];
    const w = want[k];
    expect(g.label).toBe(w.label);
    expect(g.fromISO).toBe(w.fromISO);
    expect(g.runs).toBe(w.runs);
    expect(g.tokens).toBe(w.tokens);
    // Soma de custo por grupo × por chamada: só pode divergir no arredondamento da 4ª casa.
    expect(Math.abs(g.usd - w.usd)).toBeLessThanOrEqual(0.0001);
    expect(g.operations.map((o) => o.action).sort()).toEqual(w.operations.map((o) => o.action).sort());
    for (const wo of w.operations) {
      const go = g.operations.find((o) => o.action === wo.action)!;
      expect(go.label).toBe(wo.label);
      expect(go.icon).toBe(wo.icon);
      expect(go.runs).toBe(wo.runs);
      expect(go.tokens).toBe(wo.tokens);
      expect(go.inputTokens).toBe(wo.inputTokens);
      expect(go.outputTokens).toBe(wo.outputTokens);
      expect(go.cacheReadTokens).toBe(wo.cacheReadTokens);
      expect(go.cacheWriteTokens).toBe(wo.cacheWriteTokens);
      expect(go.models).toEqual(wo.models);
      expect(go.estimated).toBe(wo.estimated);
      expect(Math.abs(go.usd - wo.usd)).toBeLessThanOrEqual(0.0001);
    }
  }
  expect(got.today.runs).toBe(want.today.runs);
  expect(got.today.tokens).toBe(want.today.tokens);
  expect(Math.abs(got.today.usd - want.today.usd)).toBeLessThanOrEqual(0.0001);
  expect(got.daily.map((d) => [d.date, d.label])).toEqual(want.daily.map((d) => [d.date, d.label]));
  got.daily.forEach((d, i) => expect(Math.abs(d.usd - want.daily[i].usd)).toBeLessThanOrEqual(0.0001));
  expect(Math.abs(got.monthProjectionUSD - want.monthProjectionUSD)).toBeLessThanOrEqual(0.01);
  if (want.costPerBotDecision === null) expect(got.costPerBotDecision).toBeNull();
  else expect(Math.abs((got.costPerBotDecision ?? 0) - want.costPerBotDecision)).toBeLessThanOrEqual(0.0001);
}

describe("aiCornerBounds", () => {
  it("janelas começam à meia-noite de Brasília (03:00Z) e o since é o menor início", () => {
    // 25/09 12:00 BRT: 30 dias começam em 27/08, antes do dia 1º.
    const b = aiCornerBounds(new Date("2026-09-25T15:00:00Z"));
    expect(b.monthStart.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(b.last30Start.toISOString()).toBe("2026-08-27T03:00:00.000Z");
    expect(b.todayStart.toISOString()).toBe("2026-09-25T03:00:00.000Z");
    expect(b.since.toISOString()).toBe("2026-08-27T03:00:00.000Z");

    // 31/10 12:00 BRT: 30 dias começam em 02/10, depois do dia 1º.
    const o = aiCornerBounds(new Date("2026-10-31T15:00:00Z"));
    expect(o.since.toISOString()).toBe("2026-10-01T03:00:00.000Z");
  });

  it("22h de Brasília ainda é o dia de Brasília (servidor em UTC já virou)", () => {
    // 30/09 22:30 BRT = 01/10 01:30Z.
    const b = aiCornerBounds(new Date("2026-10-01T01:30:00Z"));
    expect(b.monthStart.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(b.todayStart.toISOString()).toBe("2026-09-30T03:00:00.000Z");
  });
});

describe("buildAiWindowsFromGroups", () => {
  it("somar por grupo de hora/modelo dá o mesmo usd, tokens e runs que somar chamada a chamada", () => {
    for (const [nowIso, seed] of [
      ["2026-09-25T15:00:00Z", 1],
      ["2026-10-01T01:30:00Z", 2], // 22h30 BRT do último dia do mês
      ["2026-10-01T03:30:00Z", 3], // 00h30 BRT do dia 1º (mês com 1 dia)
      ["2026-02-28T12:00:00Z", 4],
    ] as const) {
      const now = new Date(nowIso);
      const calls = syntheticCalls(now, 10000, seed);
      const groups = groupLikeSql(calls, aiCornerBounds(now).since);
      // Os grupos precisam de fato juntar chamadas, senão o teste não prova nada.
      expect(groups.length).toBeLessThan(calls.length / 2);
      expectSameCorner(buildAiWindowsFromGroups(groups, NAMES, now), legacyCorner(calls, now));
    }
  });

  it("chamada às 23:59 BRT fica no dia anterior; às 00:00 BRT (03:00Z) cai em 'hoje'", () => {
    const now = new Date("2026-09-25T15:00:00Z");
    const calls: Call[] = [
      { action: "wa_bot", createdAt: new Date("2026-09-25T02:59:59Z"), usage: { model: "claude-sonnet-5", inputTokens: 1_000_000 } },
      { action: "wa_bot", createdAt: new Date("2026-09-25T03:00:00Z"), usage: { model: "claude-sonnet-5", outputTokens: 1_000_000 } },
    ];
    const got = buildAiWindowsFromGroups(groupLikeSql(calls, aiCornerBounds(now).since), NAMES, now);
    expect(got.today).toEqual({ usd: 15, tokens: 1_000_000, runs: 1 });
    expect(got.daily.find((d) => d.date === "2026-09-24")?.usd).toBe(3);
    expect(got.daily.find((d) => d.date === "2026-09-25")?.usd).toBe(15);
    expect(got.month.runs).toBe(2);
    expectSameCorner(got, legacyCorner(calls, now));
  });

  it("virada do mês: 23:59 BRT do dia 31 entra nos 30 dias, mas não no mês", () => {
    const now = new Date("2026-09-10T15:00:00Z");
    const calls: Call[] = [
      { action: "ai_audit", createdAt: new Date("2026-09-01T02:59:00Z"), usage: { model: "claude-haiku-4-5", inputTokens: 1_000_000 } },
      { action: "ai_audit", createdAt: new Date("2026-09-01T03:00:00Z"), usage: { model: "claude-haiku-4-5", inputTokens: 1_000_000 } },
    ];
    const got = buildAiWindowsFromGroups(groupLikeSql(calls, aiCornerBounds(now).since), NAMES, now);
    expect(got.month.runs).toBe(1);
    expect(got.last30.runs).toBe(2);
    expect(got.daily[0]).toEqual({ date: "2026-09-01", label: "01/09", usd: 1 });
    expect(got.daily).toHaveLength(10);
  });

  it("modelo nulo ou fora da tabela marca 'estimado' e não entra na lista de modelos", () => {
    const now = new Date("2026-09-25T15:00:00Z");
    const calls: Call[] = [
      { action: "acao_nova", createdAt: new Date("2026-09-25T10:00:00Z"), usage: { inputTokens: 10 } },
      { action: "wa_suggest", createdAt: new Date("2026-09-25T10:05:00Z"), usage: { model: "claude-haiku-4-5", inputTokens: 10 } },
    ];
    const got = buildAiWindowsFromGroups(groupLikeSql(calls, aiCornerBounds(now).since), NAMES, now);
    const nova = got.month.operations.find((o) => o.action === "acao_nova")!;
    expect(nova.estimated).toBe(true);
    expect(nova.models).toEqual([]);
    // Ação sem rótulo aparece com a própria chave e o ícone padrão.
    expect(nova.label).toBe("acao_nova");
    expect(nova.icon).toBe("sparkles");
    const sug = got.month.operations.find((o) => o.action === "wa_suggest")!;
    expect(sug.estimated).toBe(false);
    expect(sug.models).toEqual(["Haiku 4.5"]);
    expect(got.costPerBotDecision).toBeNull();
  });
});

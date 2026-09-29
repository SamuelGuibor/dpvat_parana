import { describe, expect, it } from "vitest";
import {
  accountEventSeverity,
  aggregateBotRows,
  foldAutoNotifyRows,
  medianMsToMinutes,
  normalizeAutoNotifyFailReason,
  type AutoNotifyRow,
  type BotOutcomeRow,
} from "@/app/_shared/utils/chatbot-agg";

// Painel Chatbot agregado em SQL (25/09/2026): as funções puras dobram as
// linhas do GROUP BY com a MESMA régua do laço JS antigo. Os testes comparam
// com uma reimplementação do laço antigo sobre logs "crus".

type RawBotMeta = {
  outcome?: unknown;
  intent?: unknown;
  understood?: unknown;
  confidence?: unknown;
};

/** O laço antigo de getChatbotAnalytics (só a parte wa_bot), para comparar. */
function legacyBot(metas: RawBotMeta[]) {
  const bot = {
    totalDecisions: 0, qualify: 0, disqualify: 0, handoff: 0, continueCount: 0,
    error: 0, doubts: 0, understoodRate: 0, successRate: 0, avgConfidence: 0,
  };
  let understoodTotal = 0;
  let understoodYes = 0;
  let confSum = 0;
  let confCount = 0;
  for (const meta of metas) {
    const outcome = (meta.outcome ?? "continue") as string;
    if (outcome === "error") {
      bot.error += 1;
      continue;
    }
    bot.totalDecisions += 1;
    if (outcome === "qualify") bot.qualify += 1;
    else if (outcome === "disqualify") bot.disqualify += 1;
    else if (outcome === "handoff") bot.handoff += 1;
    else bot.continueCount += 1;
    if (String(meta.intent ?? "outro") === "duvida") bot.doubts += 1;
    if (typeof meta.understood === "boolean") {
      understoodTotal += 1;
      if (meta.understood) understoodYes += 1;
    }
    if (typeof meta.confidence === "number") {
      confSum += meta.confidence;
      confCount += 1;
    }
  }
  const all = bot.totalDecisions + bot.error;
  bot.understoodRate = understoodTotal ? Math.round((understoodYes / understoodTotal) * 100) : 0;
  bot.successRate = all ? Math.round((bot.totalDecisions / all) * 100) : 0;
  bot.avgConfidence = confCount ? Math.round((confSum / confCount) * 100) : 0;
  return bot;
}

/** O que o GROUP BY outcome do SQL devolve para os mesmos logs. */
function groupLikeSql(metas: RawBotMeta[]): BotOutcomeRow[] {
  const byOutcome = new Map<string, BotOutcomeRow>();
  for (const meta of metas) {
    // COALESCE(metadata->>'outcome', 'continue')
    const outcome = meta.outcome == null ? "continue" : String(meta.outcome);
    const row = byOutcome.get(outcome)
      ?? { outcome, n: 0, doubts: 0, understoodTotal: 0, understoodYes: 0, confSum: 0, confN: 0 };
    row.n += 1;
    if (meta.intent === "duvida") row.doubts += 1;
    if (typeof meta.understood === "boolean") row.understoodTotal += 1;
    if (meta.understood === true) row.understoodYes += 1;
    if (typeof meta.confidence === "number") {
      row.confSum += meta.confidence;
      row.confN += 1;
    }
    byOutcome.set(outcome, row);
  }
  return [...byOutcome.values()];
}

const SAMPLE: RawBotMeta[] = [
  { outcome: "qualify", intent: "novo_lead", understood: true, confidence: 0.9 },
  { outcome: "qualify", intent: "duvida", understood: true, confidence: 0.8 },
  { outcome: "disqualify", intent: "novo_lead", understood: false, confidence: 0.7 },
  { outcome: "handoff", intent: "duvida", understood: true, confidence: 0.55 },
  { outcome: "continue", intent: "duvida", understood: false, confidence: 0.4 },
  { outcome: "resolve", intent: "cliente_existente", understood: true, confidence: 0.95 },
  { outcome: "send_flow", intent: "documentos", understood: true, confidence: 0.85 },
  { intent: "outro" }, // log sem outcome conta como continue
  { outcome: "continue", understood: "true", confidence: "0.9" }, // tipos inesperados não contam
  { outcome: "error", intent: "duvida", understood: true, confidence: 1 },
  { outcome: "error" },
];

describe("aggregateBotRows", () => {
  it("bate com o laço antigo para o mesmo conjunto de logs", () => {
    expect(aggregateBotRows(groupLikeSql(SAMPLE))).toEqual(legacyBot(SAMPLE));
  });

  it("resolve, send_flow e continue chegam em linhas separadas e somam em continueCount", () => {
    const rows = groupLikeSql(SAMPLE);
    const outcomes = rows.map((r) => r.outcome).sort();
    expect(outcomes).toEqual(["continue", "disqualify", "error", "handoff", "qualify", "resolve", "send_flow"]);
    const bot = aggregateBotRows(rows);
    // continue (2) + sem outcome (1) + resolve (1) + send_flow (1)
    expect(bot.continueCount).toBe(5);
    expect(bot.qualify).toBe(2);
    expect(bot.disqualify).toBe(1);
    expect(bot.handoff).toBe(1);
    expect(bot.totalDecisions).toBe(9);
  });

  it("erro só soma em error: fora de decisões, dúvidas, entendimento e confiança", () => {
    const withError = aggregateBotRows([
      { outcome: "qualify", n: 1, doubts: 0, understoodTotal: 1, understoodYes: 1, confSum: 0.5, confN: 1 },
      { outcome: "error", n: 3, doubts: 3, understoodTotal: 3, understoodYes: 0, confSum: 0, confN: 3 },
    ]);
    expect(withError.error).toBe(3);
    expect(withError.totalDecisions).toBe(1);
    expect(withError.doubts).toBe(0);
    expect(withError.understoodRate).toBe(100);
    expect(withError.avgConfidence).toBe(50);
    expect(withError.successRate).toBe(25); // 1 de 4
  });

  it("sem linhas devolve tudo zerado (sem divisão por zero)", () => {
    expect(aggregateBotRows([])).toEqual({
      totalDecisions: 0, qualify: 0, disqualify: 0, handoff: 0, continueCount: 0,
      error: 0, doubts: 0, understoodRate: 0, successRate: 0, avgConfidence: 0,
    });
  });
});

describe("medianMsToMinutes", () => {
  it("arredonda a mediana para minutos e devolve null sem dados", () => {
    expect(medianMsToMinutes(null)).toBeNull();
    expect(medianMsToMinutes(undefined)).toBeNull();
    expect(medianMsToMinutes(90_000)).toBe(2); // 1,5 min → 2
    expect(medianMsToMinutes(29_000)).toBe(0);
    expect(medianMsToMinutes(85_000_000)).toBe(1417);
  });
});

describe("normalizeAutoNotifyFailReason", () => {
  it("usa o metadata.reason novo", () => {
    expect(normalizeAutoNotifyFailReason("sem opt-in", "")).toBe("sem-opt-in");
    expect(normalizeAutoNotifyFailReason("cooldown", "")).toBe("cooldown");
    expect(normalizeAutoNotifyFailReason("sem template", "")).toBe("sem-template");
    expect(normalizeAutoNotifyFailReason("opt-out", "")).toBe("opt-out");
    expect(normalizeAutoNotifyFailReason("meta rejeitou", "")).toBe("meta-rejeitou");
  });

  it("cai no texto da mensagem nos logs antigos (reason ausente ou desconhecido)", () => {
    expect(normalizeAutoNotifyFailReason(null, "Aviso não enviado: contato sem opt-in")).toBe("sem-opt-in");
    expect(normalizeAutoNotifyFailReason(null, "Respeitando o intervalo mínimo entre avisos")).toBe("cooldown");
    expect(normalizeAutoNotifyFailReason("xyz", "nenhum template aprovado")).toBe("sem-template");
    expect(normalizeAutoNotifyFailReason(null, "falhou")).toBe("outro");
  });

  it("reason conhecido vence o texto da mensagem", () => {
    expect(normalizeAutoNotifyFailReason("opt-out", "contato sem opt-in")).toBe("opt-out");
  });
});

describe("foldAutoNotifyRows", () => {
  it("separa silêncio, falha e entregue e normaliza os motivos das falhas", () => {
    const rows: AutoNotifyRow[] = [
      { kind: "sent", reason: null, optIn: null, cooldown: null, noTemplate: null, n: 40 },
      { kind: "silence", reason: null, optIn: null, cooldown: null, noTemplate: null, n: 3 },
      { kind: "failed", reason: "cooldown", optIn: false, cooldown: false, noTemplate: false, n: 5 },
      { kind: "failed", reason: null, optIn: false, cooldown: true, noTemplate: false, n: 2 },
      { kind: "failed", reason: null, optIn: true, cooldown: false, noTemplate: true, n: 1 },
      { kind: "failed", reason: "meta rejeitou", optIn: false, cooldown: false, noTemplate: false, n: 4 },
      { kind: "failed", reason: null, optIn: false, cooldown: false, noTemplate: false, n: 6 },
    ];
    expect(foldAutoNotifyRows(rows)).toEqual({
      sent: 40,
      silenceAlerts: 3,
      failed: 18,
      byReason: { cooldown: 7, "sem-opt-in": 1, "meta-rejeitou": 4, outro: 6 },
    });
  });

  it("mesma régua da mensagem que normalizeAutoNotifyFailReason", () => {
    const message = "Aviso não enviado: nenhum template aprovado";
    const direct = normalizeAutoNotifyFailReason(null, message);
    const folded = foldAutoNotifyRows([
      { kind: "failed", reason: null, optIn: false, cooldown: false, noTemplate: true, n: 1 },
    ]);
    expect(folded.byReason).toEqual({ [direct]: 1 });
  });
});

describe("accountEventSeverity", () => {
  it("aceita critical/warning/ok e cai em info no resto", () => {
    expect(accountEventSeverity("critical")).toBe("critical");
    expect(accountEventSeverity("warning")).toBe("warning");
    expect(accountEventSeverity("ok")).toBe("ok");
    expect(accountEventSeverity("")).toBe("info");
    expect(accountEventSeverity(null)).toBe("info");
    expect(accountEventSeverity("CRITICAL")).toBe("info");
  });
});

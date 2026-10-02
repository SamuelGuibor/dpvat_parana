"use server";

import { db } from "@/app/_shared/lib/prisma";
import { requirePermission } from "@/app/_shared/lib/permissions-server";
import { COST_SERVICES, costServiceColor, costServiceLabel } from "@/app/_shared/lib/costs";
import { readFx, readSyncStatus, runCostSync } from "@/app/_shared/lib/cost-sync";
import { usageCostUSD } from "@/app/_shared/lib/ai-pricing";
import { brDayKey, brLocalToDate } from "@/app/_shared/utils/date-br";
import type { ProjectCostDTO } from "@/app/_actions/costs";

// Aba Custos (redesenho de 01/10/2026): uma linha por serviço, com a barra
// proporcional à fatia do gasto no PERÍODO escolhido. Dois jeitos de contar:
//   - Consumido: o que cada serviço gastou (APIs dos provedores via
//     cost_snapshots; Claude e Gemini direto dos tokens dos logs de IA);
//   - Pago: as faturas lançadas à mão (project_costs) — o que saiu do cartão.
// Os dois divergem por natureza (crédito pré-pago, assinatura do Plano
// Claude, fatura que fecha no mês seguinte) e é por isso que ficam separados.
//
// Claude/Gemini saem dos logs na hora, e não dos snapshots: o cron de sync
// ficou parado (401 no middleware) e deixou buracos de dias no mês.

const OPERATION_LABELS: Record<string, string> = {
  wa_bot: "Bot do WhatsApp",
  wa_bot_discarded: "Bot (respostas descartadas)",
  wa_suggest: "Sugestão de resposta",
  wa_summary: "Resumo da conversa",
  wa_ficha_ai: "Ficha automática",
  wa_followup: "Follow-up do bot",
  wa_transcribe: "Transcrição de áudio",
  ai_audit: "Auditoria de documentos",
  roteiro_ai: "Roteiro (IA)",
  doc_ia: "Gerador de documento",
};

export interface CostDetailLine {
  label: string;
  cents: number;
}

export interface CostServiceRow {
  service: string;
  label: string;
  color: string;
  /** Centavos de REAL. */
  consumedCents: number;
  /** api | logs | estimate | null (sem consumo medido). */
  consumedSource: string | null;
  /** Detalhe do consumo (operações de IA). */
  consumedDetail: CostDetailLine[];
  /** Dias do período com dado do provedor (só serviços por snapshot). */
  snapshotDays: number | null;
  paidCents: number;
  paidEntries: ProjectCostDTO[];
  /** Último erro do sync, se houver. */
  error: string | null;
}

export interface CostBreakdown {
  from: string;
  to: string;
  /** Dias do período até hoje (para comparar com snapshotDays). */
  days: number;
  fx: { rate: number; source: string };
  lastSyncAt: string | null;
  services: CostServiceRow[];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function utcDay(day: string, endOfDay = false): Date {
  const [y, m, d] = day.split("-").map(Number);
  return endOfDay ? new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999)) : new Date(Date.UTC(y, m - 1, d));
}

/**
 * Consumo e faturas por serviço no período.
 *
 * @param from "YYYY-MM-DD" (dia de Brasília), inclusive.
 * @param to   "YYYY-MM-DD" (dia de Brasília), inclusive.
 */
export async function getCostBreakdown(from: string, to: string): Promise<CostBreakdown> {
  await requirePermission("view_costs");
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to) throw new Error("Período inválido.");

  // Logs de IA: limites no fuso de Brasília. Snapshots e faturas usam a
  // própria chave de dia / o meio-dia UTC em que foram gravados.
  const logFrom = brLocalToDate(`${from}T00:00`);
  const logTo = new Date(brLocalToDate(`${to}T23:59:59`).getTime() + 999);

  const [fx, status, snapshots, paidRows, aiRows] = await Promise.all([
    readFx(),
    readSyncStatus(),
    db.costSnapshot.findMany({ where: { day: { gte: from, lte: to } } }),
    db.projectCost.findMany({
      where: { chargedAt: { gte: utcDay(from), lte: utcDay(to, true) } },
      orderBy: [{ chargedAt: "desc" }, { createdAt: "desc" }],
    }),
    // Agregado no banco por ação+modelo: o custo é linear nos tokens, então
    // somar tokens antes de precificar dá o mesmo valor com poucas linhas.
    db.$queryRaw<{ action: string; model: string | null; i: number; o: number; cr: number; cw: number }[]>`
      SELECT action, metadata->'usage'->>'model' AS model,
        COALESCE(SUM((metadata->'usage'->>'inputTokens')::float8), 0) AS i,
        COALESCE(SUM((metadata->'usage'->>'outputTokens')::float8), 0) AS o,
        COALESCE(SUM((metadata->'usage'->>'cacheReadTokens')::float8), 0) AS cr,
        COALESCE(SUM((metadata->'usage'->>'cacheWriteTokens')::float8), 0) AS cw
      FROM logs
      WHERE "createdAt" >= ${logFrom} AND "createdAt" <= ${logTo}
        AND metadata IS NOT NULL AND jsonb_exists(metadata, 'usage')
      GROUP BY 1, 2
    `,
  ]);

  const toBrl = (cents: number, currency: string) => (currency === "USD" ? Math.round(cents * fx.rate) : cents);

  // IA pelos logs, separada por provedor e operação.
  const aiByProvider = new Map<string, Map<string, number>>();
  for (const r of aiRows) {
    const provider = (r.model ?? "").startsWith("gemini") ? "gemini" : "claude";
    const usd = usageCostUSD({
      model: r.model, inputTokens: r.i, outputTokens: r.o, cacheReadTokens: r.cr, cacheWriteTokens: r.cw,
    });
    const ops = aiByProvider.get(provider) ?? new Map<string, number>();
    ops.set(r.action, (ops.get(r.action) ?? 0) + usd);
    aiByProvider.set(provider, ops);
  }
  // Com ANTHROPIC_ADMIN_KEY o Claude vem do cost_report oficial (snapshot);
  // os logs continuam servindo para o detalhe por operação.
  const claudeFromApi = status.claude?.source === "api";

  const snapByService = new Map<string, { cents: number; days: Set<string> }>();
  for (const s of snapshots) {
    const cur = snapByService.get(s.service) ?? { cents: 0, days: new Set<string>() };
    cur.cents += toBrl(s.amountCents, s.currency);
    cur.days.add(s.day);
    snapByService.set(s.service, cur);
  }

  const paidByService = new Map<string, ProjectCostDTO[]>();
  for (const c of paidRows) {
    const list = paidByService.get(c.service) ?? [];
    list.push({
      id: c.id, service: c.service, description: c.description, chargedAt: c.chargedAt.toISOString(),
      amountCents: c.amountCents, currency: c.currency, amountBrlCents: c.amountBrlCents,
    });
    paidByService.set(c.service, list);
  }

  const todayKey = brDayKey();
  const lastDay = to < todayKey ? to : todayKey;
  const days = Math.max(1, Math.round((utcDay(lastDay).getTime() - utcDay(from).getTime()) / 86_400_000) + 1);

  let lastSyncAt: string | null = null;
  for (const st of Object.values(status)) if (st?.at && (!lastSyncAt || st.at > lastSyncAt)) lastSyncAt = st.at;

  const services: CostServiceRow[] = [];
  for (const { key } of COST_SERVICES) {
    const ops = aiByProvider.get(key);
    const usesLogs = (key === "claude" && !claudeFromApi) || key === "gemini";
    const consumedDetail: CostDetailLine[] = ops
      ? [...ops.entries()]
        .map(([action, usd]) => ({ label: OPERATION_LABELS[action] ?? action, cents: Math.round(usd * 100 * fx.rate) }))
        .filter((d) => d.cents > 0)
        .sort((a, b) => b.cents - a.cents)
      : [];
    const snap = snapByService.get(key);
    let consumedCents = 0;
    let consumedSource: string | null = null;
    if (usesLogs) {
      consumedCents = consumedDetail.reduce((a, d) => a + d.cents, 0);
      consumedSource = consumedCents > 0 ? "logs" : null;
    } else if (snap) {
      consumedCents = snap.cents;
      consumedSource = status[key]?.source ?? "api";
    }
    const paidEntries = paidByService.get(key) ?? [];
    const paidCents = paidEntries.reduce((a, e) => a + e.amountBrlCents, 0);
    if (consumedCents <= 0 && paidCents <= 0) continue;

    services.push({
      service: key,
      label: costServiceLabel(key),
      color: costServiceColor(key),
      consumedCents,
      consumedSource,
      consumedDetail,
      snapshotDays: !usesLogs && snap ? snap.days.size : null,
      paidCents,
      paidEntries,
      error: status[key]?.error ?? null,
    });
  }

  return { from, to, days, fx: { rate: fx.rate, source: fx.source }, lastSyncAt, services };
}

/** Botão "Atualizar agora" do painel (1..35 dias para trás). */
export async function syncCostsNow(days = 3): Promise<{ ok: true }> {
  await requirePermission("view_costs");
  await runCostSync(Math.min(Math.max(days, 1), 35));
  return { ok: true };
}

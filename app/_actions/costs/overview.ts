"use server";

import { db } from "@/app/_shared/lib/prisma";
import { requirePermission } from "@/app/_shared/lib/permissions-server";
import { COST_SERVICES, COST_PROVIDER_INFO, costServiceColor, costServiceLabel } from "@/app/_shared/lib/costs";
import { readFx, readSyncStatus, runCostSync, type CostSyncEntry } from "@/app/_shared/lib/cost-sync";
import {
  brDayKey, brDayKeySeries, brDaysInMonth, brDayOfMonth, brLabelFromKey, brStartOfMonth,
} from "@/app/_shared/utils/date-br";

// Painel de custos com projeção (pedido do escritório, 14/09/2026): quanto
// cada serviço está consumindo AGORA, quanto vai dar no fim do mês e, quando
// o serviço é pré-pago, por quantos dias o crédito ainda dura.
//
// Fontes, por serviço: cost_snapshots (APIs / logs, via cost-sync) e os
// lançamentos manuais (project_costs) — que continuam valendo como "fatura".

export interface ServiceCredit {
  amountCents: number;
  currency: string;
  /** "YYYY-MM-DD" — desde quando esse saldo vale (gasto a partir daí desconta). */
  setAt: string;
  remainingCents: number;
  daysLeft: number | null;
  note: string | null;
}

export interface ServiceCostCard {
  service: string;
  label: string;
  color: string;
  /** api | logs | estimate | manual | none */
  source: string;
  configured: boolean;
  error: string | null;
  note: string | null;
  lastSyncAt: string | null;
  billingUrl: string | null;
  how: string | null;
  envVars: string[];
  /** Tudo em centavos de REAL. */
  mtdCents: number;
  avgDailyCents: number;
  projectedMonthCents: number;
  prevMonthCents: number;
  manualMonthCents: number;
  /** Último dia com consumo registrado (YYYY-MM-DD). */
  lastDay: string | null;
  credit: ServiceCredit | null;
}

export interface CostOverview {
  fx: { rate: number; at: string | null; source: string };
  lastSyncAt: string | null;
  monthLabel: string;
  daysElapsed: number;
  daysInMonth: number;
  totals: { mtdCents: number; projectedMonthCents: number; prevMonthCents: number; manualMonthCents: number };
  services: ServiceCostCard[];
  /** Série diária dos últimos 30 dias, em REAL (chave = service). */
  daily: ({ day: string; label: string } & Record<string, number | string>)[];
}

const CREDIT_KEY = (service: string) => `cost_credit_${service}`;

interface StoredCredit { amountCents: number; currency: string; setAt: string; note?: string | null }

function toBrl(amountCents: number, currency: string, fx: number): number {
  return currency === "USD" ? Math.round(amountCents * fx) : amountCents;
}

export async function getCostOverview(): Promise<CostOverview> {
  await requirePermission("view_costs");

  const now = new Date();
  const monthStart = brStartOfMonth(now);
  const prevMonthStart = brStartOfMonth(new Date(monthStart.getTime() - 86_400_000));
  const monthKey = brDayKey(monthStart).slice(0, 7);
  const prevMonthKey = brDayKey(prevMonthStart).slice(0, 7);
  const daysElapsed = brDayOfMonth(now);
  const daysInMonth = brDaysInMonth(now);
  const sinceDay = brDayKey(new Date(prevMonthStart.getTime()));
  const last30 = brDayKeySeries(30);
  const last14 = new Set(brDayKeySeries(14));

  const [fx, status, snapshots, manualRows, creditRows] = await Promise.all([
    readFx(),
    readSyncStatus(),
    db.costSnapshot.findMany({ where: { day: { gte: sinceDay } }, orderBy: { day: "asc" } }),
    db.projectCost.findMany({ where: { chargedAt: { gte: prevMonthStart } } }),
    db.appSetting.findMany({ where: { key: { startsWith: "cost_credit_" } } }),
  ]);

  const credits = new Map<string, StoredCredit>();
  for (const r of creditRows) {
    try { credits.set(r.key.replace("cost_credit_", ""), JSON.parse(r.value) as StoredCredit); } catch { /* ignora */ }
  }

  // Snapshots por serviço → mapa dia → BRL.
  const byService = new Map<string, Map<string, { brl: number; native: number; currency: string }>>();
  for (const s of snapshots) {
    const m = byService.get(s.service) ?? new Map();
    m.set(s.day, { brl: toBrl(s.amountCents, s.currency, fx.rate), native: s.amountCents, currency: s.currency });
    byService.set(s.service, m);
  }

  // Faturas manuais por serviço e mês.
  const manual = new Map<string, { cur: number; prev: number }>();
  for (const r of manualRows) {
    const month = r.chargedAt.toISOString().slice(0, 7);
    const m = manual.get(r.service) ?? { cur: 0, prev: 0 };
    if (month === monthKey) m.cur += r.amountBrlCents;
    else if (month === prevMonthKey) m.prev += r.amountBrlCents;
    manual.set(r.service, m);
  }

  const services: ServiceCostCard[] = [];
  const known = new Set<string>([...byService.keys(), ...manual.keys(), ...Object.keys(COST_PROVIDER_INFO)]);
  let lastSyncAt: string | null = null;

  for (const svc of COST_SERVICES.map((s) => s.key)) {
    if (!known.has(svc)) continue;
    const st: CostSyncEntry | undefined = status[svc];
    const days = byService.get(svc) ?? new Map();
    const info = COST_PROVIDER_INFO[svc] ?? null;
    if (st?.at && (!lastSyncAt || st.at > lastSyncAt)) lastSyncAt = st.at;

    let mtd = 0, prev = 0, sum14 = 0, n14 = 0, lastDay: string | null = null;
    for (const [day, v] of days) {
      if (day.startsWith(monthKey)) mtd += v.brl;
      else if (day.startsWith(prevMonthKey)) prev += v.brl;
      if (last14.has(day)) { sum14 += v.brl; n14 += 1; }
      if (!lastDay || day > lastDay) lastDay = day;
    }
    // Média por dia dos últimos 14 dias COM registro (dias ainda não fechados
    // pelo provedor não puxam a média pra baixo).
    const avgDaily = n14 > 0 ? Math.round(sum14 / n14) : 0;
    const hasSnapshots = days.size > 0;
    const man = manual.get(svc) ?? { cur: 0, prev: 0 };
    const projected = hasSnapshots ? mtd + avgDaily * Math.max(0, daysInMonth - daysElapsed) : man.cur;

    // Crédito pré-pago: saldo informado − consumo desde a data informada.
    let credit: ServiceCredit | null = null;
    const c = credits.get(svc);
    if (c && c.amountCents > 0) {
      let spent = 0;
      for (const [day, v] of days) {
        if (day < c.setAt) continue;
        // Consumo na MOEDA do crédito.
        if (c.currency === "USD") spent += v.currency === "USD" ? v.native : Math.round(v.brl / fx.rate);
        else spent += v.brl;
      }
      const remaining = Math.max(0, c.amountCents - spent);
      const avgNative = c.currency === "USD" ? Math.round(avgDaily / fx.rate) : avgDaily;
      credit = {
        amountCents: c.amountCents, currency: c.currency, setAt: c.setAt, note: c.note ?? null,
        remainingCents: remaining,
        daysLeft: avgNative > 0 ? Math.floor(remaining / avgNative) : null,
      };
    }

    const source = hasSnapshots ? (st?.source ?? "api") : man.cur > 0 || man.prev > 0 ? "manual" : "none";
    services.push({
      service: svc,
      label: costServiceLabel(svc),
      color: costServiceColor(svc),
      source,
      configured: st ? st.configured : hasSnapshots,
      error: st?.error ?? null,
      note: st?.note ?? null,
      lastSyncAt: st?.at ?? null,
      billingUrl: info?.billingUrl ?? null,
      how: info?.how ?? null,
      envVars: info?.envVars ?? [],
      mtdCents: mtd,
      avgDailyCents: avgDaily,
      projectedMonthCents: projected,
      prevMonthCents: hasSnapshots ? prev : man.prev,
      manualMonthCents: man.cur,
      lastDay,
      credit,
    });
  }
  services.sort((a, b) => b.projectedMonthCents - a.projectedMonthCents);

  const daily = last30.map((day) => {
    const row: { day: string; label: string } & Record<string, number | string> = { day, label: brLabelFromKey(day) };
    for (const s of services) {
      const v = byService.get(s.service)?.get(day);
      if (v) row[s.service] = Math.round(v.brl) / 100;
    }
    return row;
  });

  const monthNames = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return {
    fx,
    lastSyncAt,
    monthLabel: `${monthNames[Number(monthKey.slice(5, 7)) - 1]} de ${monthKey.slice(0, 4)}`,
    daysElapsed,
    daysInMonth,
    totals: {
      mtdCents: services.reduce((a, s) => a + s.mtdCents, 0),
      projectedMonthCents: services.reduce((a, s) => a + s.projectedMonthCents, 0),
      prevMonthCents: services.reduce((a, s) => a + s.prevMonthCents, 0),
      manualMonthCents: services.reduce((a, s) => a + s.manualMonthCents, 0),
    },
    services,
    daily,
  };
}

/** Botão "Atualizar agora" do painel. */
export async function syncCostsNow(days = 3): Promise<{ ok: true }> {
  await requirePermission("view_costs");
  await runCostSync(Math.min(Math.max(days, 1), 62));
  return { ok: true };
}

/**
 * Informa o saldo pré-pago de um serviço (ex.: créditos comprados na
 * Anthropic). amountCents 0 apaga.
 */
export async function setServiceCredit(input: {
  service: string; amountCents: number; currency: string; setAt: string; note?: string | null;
}): Promise<{ ok: true }> {
  await requirePermission("view_costs");
  const key = CREDIT_KEY(input.service);
  if (!COST_SERVICES.some((s) => s.key === input.service)) throw new Error("Serviço inválido.");
  if (!input.amountCents || input.amountCents <= 0) {
    await db.appSetting.deleteMany({ where: { key } });
    return { ok: true };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.setAt)) throw new Error("Data inválida.");
  const currency = input.currency === "USD" ? "USD" : "BRL";
  const value = JSON.stringify({
    amountCents: Math.round(input.amountCents), currency, setAt: input.setAt, note: input.note?.trim() || null,
  } satisfies StoredCredit);
  await db.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } });
  return { ok: true };
}

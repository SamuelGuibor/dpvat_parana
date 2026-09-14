// Sincronização dos custos (14/09/2026): roda no cron diário (/api/costs/sync)
// e no botão "Atualizar agora" do painel. Puxa o consumo diário de cada
// provedor, grava em cost_snapshots (um registro por serviço × dia) e guarda
// o status de cada integração em app_settings pra tela mostrar o que está
// configurado, o que falhou e por quê.

import { Prisma } from "@prisma/client";
import { db } from "./prisma";
import { brStartOfDaysAgo } from "../utils/date-br";
import { fetchAllProviders, fetchUsdBrl, type CostSource } from "./cost-providers";

export const COST_SYNC_STATUS_KEY = "cost_sync_status";
export const COST_FX_KEY = "cost_fx_usd_brl";

export interface CostSyncEntry {
  at: string;
  ok: boolean;
  configured: boolean;
  source?: CostSource;
  note?: string;
  error?: string;
  days?: number;
}

export type CostSyncStatus = Record<string, CostSyncEntry>;

export async function readSyncStatus(): Promise<CostSyncStatus> {
  const row = await db.appSetting.findUnique({ where: { key: COST_SYNC_STATUS_KEY } }).catch(() => null);
  if (!row) return {};
  try { return JSON.parse(row.value) as CostSyncStatus; } catch { return {}; }
}

export async function readFx(): Promise<{ rate: number; at: string | null; source: string }> {
  const row = await db.appSetting.findUnique({ where: { key: COST_FX_KEY } }).catch(() => null);
  if (row) {
    try {
      const j = JSON.parse(row.value) as { rate: number; source: string };
      if (Number.isFinite(j.rate) && j.rate > 0) return { rate: j.rate, at: row.updatedAt.toISOString(), source: j.source };
    } catch { /* cai no fetch */ }
  }
  const fx = await fetchUsdBrl();
  return { rate: fx.rate, at: null, source: fx.source };
}

/**
 * @param days quantos dias pra trás refazer (o cron usa 3 — os provedores
 * fecham o dia com atraso; a primeira carga usa 35).
 */
export async function runCostSync(days = 3): Promise<{ status: CostSyncStatus; fx: number }> {
  const range = { from: brStartOfDaysAgo(Math.max(1, days) - 1), to: new Date() };
  const fx = await fetchUsdBrl();
  await db.appSetting.upsert({
    where: { key: COST_FX_KEY },
    update: { value: JSON.stringify({ rate: fx.rate, source: fx.source }) },
    create: { key: COST_FX_KEY, value: JSON.stringify({ rate: fx.rate, source: fx.source }) },
  });

  const previous = await readSyncStatus();
  const status: CostSyncStatus = { ...previous };
  const results = await fetchAllProviders(range, fx.rate);
  const at = new Date().toISOString();

  for (const r of results) {
    if ("error" in r) {
      status[r.service] = { ...(previous[r.service] ?? { configured: true }), at, ok: false, error: r.error };
      continue;
    }
    if (!r.configured) {
      status[r.service] = { at, ok: true, configured: false, source: r.source, note: r.note };
      continue;
    }
    for (const d of r.days) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.day)) continue;
      await db.costSnapshot.upsert({
        where: { service_day: { service: r.service, day: d.day } },
        update: { amountCents: d.amountCents, currency: d.currency, source: r.source, detail: (d.detail ?? undefined) as Prisma.InputJsonValue | undefined, fetchedAt: new Date() },
        create: { service: r.service, day: d.day, amountCents: d.amountCents, currency: d.currency, source: r.source, detail: (d.detail ?? undefined) as Prisma.InputJsonValue | undefined },
      });
    }
    status[r.service] = { at, ok: true, configured: true, source: r.source, note: r.note, days: r.days.length };
  }

  await db.appSetting.upsert({
    where: { key: COST_SYNC_STATUS_KEY },
    update: { value: JSON.stringify(status) },
    create: { key: COST_SYNC_STATUS_KEY, value: JSON.stringify(status) },
  });
  return { status, fx: fx.rate };
}

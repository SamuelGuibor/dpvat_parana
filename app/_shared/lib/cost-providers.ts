/* eslint-disable @typescript-eslint/no-explicit-any */
// Integrações de CUSTO com os provedores (14/09/2026).
//
// Cada função devolve o consumo DIÁRIO de um serviço no intervalo pedido, na
// moeda em que o provedor cobra. Quem grava em cost_snapshots e converte pra
// real é o cost-sync.ts. Regra geral: chave ausente = "não configurado" (não
// é erro); chamada que falha = erro com a mensagem do provedor, pra aparecer
// no painel em vez de sumir num log.
//
// O que cada provedor expõe:
// - Anthropic: relatório de custo da API Admin (precisa de chave Admin).
//   Fallback: tokens gravados em logs.metadata.usage × tabela de preços.
// - Neon: API de consumo (compute/storage/tráfego) × preço do plano.
// - Railway: GraphQL de uso (CPU/memória/saída) × preço por minuto — estimativa.
// - Meta Ads: insights da conta de anúncios (gasto/dia, moeda da conta).
// - WhatsApp: pricing_analytics das WABAs cadastradas (custo por mensagem).
// - AWS: Cost Explorer (custo real por dia).
// - Vercel: NÃO tem API pública de gasto — fica no lançamento manual.

import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { db } from "./prisma";
import { usageCostUSD } from "./ai-pricing";
import { brDayKey } from "../utils/date-br";
import { listAllCreds } from "./whatsapp/numbers";

export type CostCurrency = "USD" | "BRL";
export type CostSource = "api" | "logs" | "estimate";

export interface DailyCost {
  day: string; // YYYY-MM-DD
  amountCents: number;
  currency: CostCurrency;
  detail?: Record<string, unknown>;
}

export interface ProviderResult {
  service: string;
  configured: boolean;
  source: CostSource;
  days: DailyCost[];
  note?: string;
}

export interface CostRange {
  from: Date;
  to: Date;
}

const num = (v: unknown, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const dayOfIso = (iso: string) => iso.slice(0, 10);
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const cents = (v: number) => Math.round(v * 100);

async function getJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, { ...init, cache: "no-store" });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const msg = body?.error?.message ?? body?.message ?? body?.error ?? body?.raw ?? `HTTP ${res.status}`;
    throw new Error(`${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg).slice(0, 300)}`);
  }
  return body;
}

// ─── Câmbio ────────────────────────────────────────────────────────────────

/** USD→BRL do dia (awesomeapi); COST_USD_BRL fixa o câmbio se preenchida. */
export async function fetchUsdBrl(fallback = 5.1): Promise<{ rate: number; source: string }> {
  const fixed = Number(process.env.COST_USD_BRL);
  if (Number.isFinite(fixed) && fixed > 0) return { rate: fixed, source: "env" };
  try {
    const j = await getJson("https://economia.awesomeapi.com.br/json/last/USD-BRL");
    const bid = Number(j?.USDBRL?.bid);
    if (Number.isFinite(bid) && bid > 0) return { rate: bid, source: "awesomeapi" };
  } catch { /* cai no fallback */ }
  return { rate: fallback, source: "fallback" };
}

// ─── Anthropic (Claude) ────────────────────────────────────────────────────

export async function anthropicCosts(range: CostRange): Promise<ProviderResult> {
  const key = process.env.ANTHROPIC_ADMIN_KEY;
  if (!key) {
    // Sem chave Admin: estimativa pelos tokens dos logs (mesma conta do Canto da IA).
    const days = await aiCostsFromLogs(range, "claude");
    return { service: "claude", configured: true, source: "logs", days, note: "estimado pelos tokens dos logs (sem ANTHROPIC_ADMIN_KEY)" };
  }
  const byDay = new Map<string, number>();
  let page: string | null = null;
  for (let i = 0; i < 10; i++) {
    const url = new URL("https://api.anthropic.com/v1/organizations/cost_report");
    url.searchParams.set("starting_at", range.from.toISOString());
    url.searchParams.set("ending_at", range.to.toISOString());
    url.searchParams.set("bucket_width", "1d");
    url.searchParams.set("limit", "31");
    if (page) url.searchParams.set("page", page);
    const j = await getJson(url.toString(), {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    for (const bucket of j?.data ?? []) {
      const day = dayOfIso(String(bucket.starting_at ?? ""));
      let usd = 0;
      for (const r of bucket.results ?? []) {
        const amount = Number(r.amount ?? 0);
        // A API devolve o valor na menor unidade da moeda (centavos de dólar).
        // ANTHROPIC_COST_UNIT=usd força leitura em dólares inteiros se a conta
        // não bater com o console.
        usd += process.env.ANTHROPIC_COST_UNIT === "usd" ? amount : amount / 100;
      }
      byDay.set(day, (byDay.get(day) ?? 0) + usd);
    }
    page = j?.has_more && j?.next_page ? String(j.next_page) : null;
    if (!page) break;
  }
  const days = [...byDay.entries()].map(([day, usd]) => ({ day, amountCents: cents(usd), currency: "USD" as const }));
  return { service: "claude", configured: true, source: "api", days };
}

/** Custo diário estimado pelos logs de IA (metadata.usage), por provedor. */
export async function aiCostsFromLogs(range: CostRange, provider: "claude" | "gemini"): Promise<DailyCost[]> {
  const rows = await db.$queryRaw<{ createdAt: Date; usage: any }[]>`
    SELECT "createdAt", metadata->'usage' AS usage
    FROM logs
    WHERE metadata ? 'usage' AND "createdAt" >= ${range.from} AND "createdAt" <= ${range.to}
  `;
  const byDay = new Map<string, { usd: number; calls: number }>();
  for (const r of rows) {
    const model = String(r.usage?.model ?? "claude");
    const p = model.startsWith("gemini") ? "gemini" : "claude";
    if (p !== provider) continue;
    const key = brDayKey(r.createdAt);
    const cur = byDay.get(key) ?? { usd: 0, calls: 0 };
    cur.usd += usageCostUSD(r.usage ?? {});
    cur.calls += 1;
    byDay.set(key, cur);
  }
  return [...byDay.entries()].map(([day, v]) => ({
    day, amountCents: cents(v.usd), currency: "USD" as const, detail: { calls: v.calls },
  }));
}

export async function geminiCosts(range: CostRange): Promise<ProviderResult> {
  const days = await aiCostsFromLogs(range, "gemini");
  return {
    service: "gemini", configured: days.length > 0, source: "logs", days,
    note: days.length ? "estimado pelos tokens dos logs" : "sem telemetria por chamada — lançar a fatura do Google manualmente",
  };
}

// ─── Neon ──────────────────────────────────────────────────────────────────

export async function neonCosts(range: CostRange): Promise<ProviderResult> {
  const key = process.env.NEON_API_KEY;
  const projectId = process.env.NEON_PROJECT_ID;
  if (!key || !projectId) return { service: "neon", configured: false, source: "api", days: [] };

  const priceCuHour = num(process.env.NEON_PRICE_CU_HOUR, 0.106);
  const priceTransferGb = num(process.env.NEON_PRICE_TRANSFER_GB, 0.0205);
  const priceStorageGbMonth = num(process.env.NEON_PRICE_STORAGE_GB_MONTH, 0.35);

  // O histórico diário (consumption_history) é só do plano Scale. No plano
  // atual o endpoint do projeto traz o ACUMULADO do período de cobrança
  // (compute, tráfego, storage). Estratégia: a cada sync lemos o acumulado,
  // guardamos em app_settings e a DIFERENÇA desde a leitura anterior vira o
  // consumo de hoje. Na primeira leitura, o acumulado é dividido por igual
  // entre os dias do período já passados.
  const j = await getJson(`https://console.neon.tech/api/v2/projects/${encodeURIComponent(projectId)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  const p = j?.project ?? {};
  const computeHours = Number(p.compute_time_seconds ?? 0) / 3600;
  const transferGb = Number(p.data_transfer_bytes ?? 0) / 1e9;
  const storageGb = Number(p.synthetic_storage_size ?? 0) / 1e9;
  const periodStart = String(p.consumption_period_start ?? "").slice(0, 10) || isoDay(new Date());
  const today = isoDay(new Date());
  const daysElapsed = Math.max(1, Math.round((Date.parse(today) - Date.parse(periodStart)) / 86_400_000) + 1);
  // Storage é cobrado por GB-mês: pró-rata dos dias já passados.
  const usdTotal = computeHours * priceCuHour + transferGb * priceTransferGb
    + storageGb * priceStorageGbMonth * (daysElapsed / 30);

  const ACC_KEY = "cost_neon_cumulative";
  interface Acc { periodStart: string; usdTotal: number; today: { day: string; usd: number } }
  const prevRow = await db.appSetting.findUnique({ where: { key: ACC_KEY } }).catch(() => null);
  let prev: Acc | null = null;
  try { prev = prevRow ? (JSON.parse(prevRow.value) as Acc) : null; } catch { prev = null; }

  const detail = { computeHours: +computeHours.toFixed(2), transferGb: +transferGb.toFixed(2), storageGb: +storageGb.toFixed(3), periodStart };
  let days: DailyCost[];
  let todayUsd: number;
  if (!prev || prev.periodStart !== periodStart) {
    // Primeira leitura do período: distribui o acumulado pelos dias passados.
    const perDay = usdTotal / daysElapsed;
    days = [];
    for (let i = 0; i < daysElapsed; i++) {
      const d = new Date(Date.parse(periodStart) + i * 86_400_000);
      days.push({ day: isoDay(d), amountCents: cents(perDay), currency: "USD", detail: { ...detail, spread: true } });
    }
    todayUsd = perDay;
  } else {
    const delta = Math.max(0, usdTotal - prev.usdTotal);
    todayUsd = (prev.today?.day === today ? prev.today.usd : 0) + delta;
    days = [{ day: today, amountCents: cents(todayUsd), currency: "USD", detail }];
  }
  const acc: Acc = { periodStart, usdTotal, today: { day: today, usd: todayUsd } };
  await db.appSetting.upsert({
    where: { key: ACC_KEY },
    update: { value: JSON.stringify(acc) },
    create: { key: ACC_KEY, value: JSON.stringify(acc) },
  });
  // Só os dias dentro do intervalo pedido (o sync grava o que vier).
  const fromDay = isoDay(range.from);
  days = days.filter((d) => d.day >= fromDay);
  return {
    service: "neon", configured: true, source: "api", days,
    note: `período desde ${periodStart.slice(8, 10)}/${periodStart.slice(5, 7)}: ${computeHours.toFixed(1)} h de compute, ${transferGb.toFixed(0)} GB de tráfego`,
  };
}

// ─── Railway ───────────────────────────────────────────────────────────────

export async function railwayCosts(range: CostRange): Promise<ProviderResult> {
  const token = process.env.RAILWAY_API_TOKEN;
  const projectId = process.env.RAILWAY_PROJECT_ID;
  if (!token || !projectId) return { service: "railway", configured: false, source: "estimate", days: [] };

  const priceCpuMin = num(process.env.RAILWAY_PRICE_VCPU_MIN, 0.000463);
  const priceMemMin = num(process.env.RAILWAY_PRICE_GB_MIN, 0.000231);
  const priceEgressGb = num(process.env.RAILWAY_PRICE_EGRESS_GB, 0.05);

  const query = `query($projectId:String!,$start:DateTime!,$end:DateTime!){
    usage(projectId:$projectId, measurements:[CPU_USAGE, MEMORY_USAGE_GB, NETWORK_TX_GB], startDate:$start, endDate:$end){ measurement value }
  }`;
  const days: DailyCost[] = [];
  const cursor = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), range.from.getUTCDate()));
  while (cursor <= range.to) {
    const start = new Date(cursor);
    const end = new Date(cursor.getTime() + 86_400_000);
    const j = await getJson("https://backboard.railway.com/graphql/v2", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { projectId, start: start.toISOString(), end: end.toISOString() } }),
    });
    if (j?.errors?.length) throw new Error(String(j.errors[0]?.message ?? "GraphQL error"));
    let cpuMin = 0, memMin = 0, egressGb = 0;
    for (const u of j?.data?.usage ?? []) {
      const v = Number(u.value ?? 0);
      if (u.measurement === "CPU_USAGE") cpuMin += v;
      else if (u.measurement === "MEMORY_USAGE_GB") memMin += v;
      else if (u.measurement === "NETWORK_TX_GB") egressGb += v;
    }
    const usd = cpuMin * priceCpuMin + memMin * priceMemMin + egressGb * priceEgressGb;
    days.push({ day: isoDay(start), amountCents: cents(usd), currency: "USD", detail: { cpuMin: +cpuMin.toFixed(1), memMin: +memMin.toFixed(1), egressGb: +egressGb.toFixed(3) } });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return { service: "railway", configured: true, source: "estimate", days, note: "uso × preço por minuto (ajustável por RAILWAY_PRICE_*)" };
}

// ─── Meta Ads ──────────────────────────────────────────────────────────────

function metaAdAccounts(): { id: string; token: string }[] {
  const out: { id: string; token: string }[] = [];
  const main = process.env.META_ADS_ACCOUNT_ID;
  const mainToken = process.env.META_ADS_TOKEN ?? process.env.META_CONVERSIONS_TOKEN;
  if (main && mainToken) out.push({ id: main, token: mainToken });
  const legacy = process.env.META_ADS_ACCOUNT_BOTCONVERSA;
  const legacyToken = process.env.META_ADS_TOKEN_BOTCONVERSA ?? mainToken;
  if (legacy && legacyToken && legacy !== main) out.push({ id: legacy, token: legacyToken });
  return out;
}

export async function metaAdsCosts(range: CostRange, usdBrl: number): Promise<ProviderResult> {
  const accounts = metaAdAccounts();
  if (!accounts.length) return { service: "meta", configured: false, source: "api", days: [] };
  const byDay = new Map<string, number>(); // em BRL
  for (const acc of accounts) {
    const id = acc.id.replace(/^act_/, "");
    const url = new URL(`https://graph.facebook.com/v21.0/act_${id}/insights`);
    url.searchParams.set("level", "account");
    url.searchParams.set("fields", "spend,account_currency");
    url.searchParams.set("time_increment", "1");
    url.searchParams.set("time_range", JSON.stringify({ since: isoDay(range.from), until: isoDay(range.to) }));
    url.searchParams.set("limit", "100");
    url.searchParams.set("access_token", acc.token);
    const j = await getJson(url.toString());
    for (const row of j?.data ?? []) {
      const spend = Number(row.spend ?? 0);
      const currency = String(row.account_currency ?? "BRL");
      const brl = currency === "USD" ? spend * usdBrl : spend;
      byDay.set(row.date_start, (byDay.get(row.date_start) ?? 0) + brl);
    }
  }
  const days = [...byDay.entries()].map(([day, brl]) => ({ day, amountCents: cents(brl), currency: "BRL" as const }));
  return { service: "meta", configured: true, source: "api", days, note: `${accounts.length} conta(s) de anúncios` };
}

// ─── WhatsApp (custo das conversas/mensagens por WABA) ─────────────────────

export async function whatsappCosts(range: CostRange): Promise<ProviderResult> {
  const creds = (await listAllCreds()).filter((c) => c.wabaId);
  if (!creds.length) return { service: "whatsapp", configured: false, source: "api", days: [] };
  const seenWaba = new Set<string>();
  const byDay = new Map<string, { usd: number; msgs: number }>();
  const startUnix = Math.floor(range.from.getTime() / 1000);
  const endUnix = Math.floor(range.to.getTime() / 1000);
  // Cada WABA falha sozinha: o token de uma linha pode não ter
  // whatsapp_business_management e a outra continuar somando.
  const okLabels: string[] = [];
  const failures: string[] = [];
  for (const c of creds) {
    if (seenWaba.has(c.wabaId)) continue;
    seenWaba.add(c.wabaId);
    const field = `pricing_analytics.start(${startUnix}).end(${endUnix}).granularity(DAILY).metric_types(["COST","VOLUME"])`;
    const url = `https://graph.facebook.com/${c.apiVersion}/${c.wabaId}?fields=${encodeURIComponent(field)}&access_token=${encodeURIComponent(c.token)}`;
    try {
      const j = await getJson(url);
      const points = j?.pricing_analytics?.data?.[0]?.data_points ?? [];
      for (const p of points) {
        const day = isoDay(new Date(Number(p.start) * 1000));
        const cur = byDay.get(day) ?? { usd: 0, msgs: 0 };
        cur.usd += Number(p.cost ?? 0);
        cur.msgs += Number(p.volume ?? 0);
        byDay.set(day, cur);
      }
      okLabels.push(c.label);
    } catch (e) {
      failures.push(`${c.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (!okLabels.length) throw new Error(failures.join(" | "));
  const days = [...byDay.entries()].map(([day, v]) => ({
    day, amountCents: cents(v.usd), currency: "USD" as const, detail: { messages: v.msgs },
  }));
  const note = failures.length
    ? `${okLabels.join(", ")} ok · sem permissão: ${failures.join(" | ")}`
    : `${okLabels.join(", ")}`;
  return { service: "whatsapp", configured: true, source: "api", days, note };
}

// ─── AWS ───────────────────────────────────────────────────────────────────

export async function awsCosts(range: CostRange): Promise<ProviderResult> {
  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    return { service: "aws", configured: false, source: "api", days: [] };
  }
  const client = new CostExplorerClient({
    region: "us-east-1",
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
  });
  const end = new Date(range.to.getTime() + 86_400_000);
  const res = await client.send(new GetCostAndUsageCommand({
    TimePeriod: { Start: isoDay(range.from), End: isoDay(end) },
    Granularity: "DAILY",
    Metrics: ["UnblendedCost"],
  }));
  const days: DailyCost[] = [];
  for (const r of res.ResultsByTime ?? []) {
    const usd = Number(r.Total?.UnblendedCost?.Amount ?? 0);
    if (r.TimePeriod?.Start) days.push({ day: r.TimePeriod.Start, amountCents: cents(usd), currency: "USD" });
  }
  return { service: "aws", configured: true, source: "api", days };
}

// ─── Vercel ────────────────────────────────────────────────────────────────

export async function vercelCosts(): Promise<ProviderResult> {
  return {
    service: "vercel", configured: false, source: "api", days: [],
    note: "a Vercel não expõe gasto por API — lançar a fatura manualmente",
  };
}

/** Todos os provedores, em paralelo; cada um falha sozinho. */
export async function fetchAllProviders(range: CostRange, usdBrl: number): Promise<(ProviderResult | { service: string; error: string })[]> {
  const jobs: { service: string; run: () => Promise<ProviderResult> }[] = [
    { service: "claude", run: () => anthropicCosts(range) },
    { service: "gemini", run: () => geminiCosts(range) },
    { service: "neon", run: () => neonCosts(range) },
    { service: "railway", run: () => railwayCosts(range) },
    { service: "meta", run: () => metaAdsCosts(range, usdBrl) },
    { service: "whatsapp", run: () => whatsappCosts(range) },
    { service: "aws", run: () => awsCosts(range) },
    { service: "vercel", run: () => vercelCosts() },
  ];
  return Promise.all(jobs.map(async (j) => {
    try { return await j.run(); }
    catch (e) { return { service: j.service, error: e instanceof Error ? e.message : String(e) }; }
  }));
}

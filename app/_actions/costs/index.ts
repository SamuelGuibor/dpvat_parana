"use server";

import { db } from "@/app/_shared/lib/prisma";
import { requirePermission } from "@/app/_shared/lib/permissions-server";
import { COST_CURRENCIES, COST_SERVICE_KEYS } from "@/app/_shared/lib/costs";

// Controle MANUAL dos custos de infraestrutura do projeto (Vercel, Neon,
// Claude, Railway, AWS...). Não há integração com as faturas dos provedores:
// a pessoa lança o que foi cobrado e em que dia.
//
// Tudo aqui exige a permissão view_costs, que nasce exclusiva do ADMIN++.

export interface ProjectCostDTO {
  id: string;
  service: string;
  description: string | null;
  /** ISO da data da cobrança. */
  chargedAt: string;
  /** Valor na moeda de origem, em centavos. */
  amountCents: number;
  currency: string;
  /** O mesmo valor em real, em centavos — é o que soma nos totais. */
  amountBrlCents: number;
}

export interface CostsSummary {
  entries: ProjectCostDTO[];
  /** Total em centavos de real de tudo no período. */
  totalBrlCents: number;
  /** Total por serviço, do maior para o menor. */
  byService: { service: string; totalBrlCents: number; count: number }[];
  /** Total por mês (YYYY-MM), do mais antigo para o mais recente. */
  byMonth: { month: string; totalBrlCents: number }[];
}

export interface CostInput {
  service: string;
  description?: string | null;
  /** "YYYY-MM-DD" — o dia em que a cobrança caiu. */
  chargedAt: string;
  /** Valor na moeda de origem, em centavos. */
  amountCents: number;
  currency: string;
  /** Valor em real, em centavos. Obrigatório só quando currency != BRL. */
  amountBrlCents?: number | null;
}

interface CostRow {
  id: string;
  service: string;
  description: string | null;
  chargedAt: Date;
  amountCents: number;
  currency: string;
  amountBrlCents: number;
}

function toDTO(c: CostRow): ProjectCostDTO {
  return {
    id: c.id,
    service: c.service,
    description: c.description,
    chargedAt: c.chargedAt.toISOString(),
    amountCents: c.amountCents,
    currency: c.currency,
    amountBrlCents: c.amountBrlCents,
  };
}

/**
 * Interpreta "YYYY-MM-DD" como MEIO-DIA UTC. Gravar à meia-noite faria o dia
 * escorregar para o anterior quando lido em fuso negativo (Brasil é UTC-3).
 */
function parseChargedAt(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) throw new Error("Data inválida.");
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  if (Number.isNaN(d.getTime())) throw new Error("Data inválida.");
  return d;
}

function validate(input: CostInput) {
  const service = input.service.trim();
  if (!COST_SERVICE_KEYS.includes(service)) throw new Error("Serviço inválido.");

  const currency = input.currency.trim().toUpperCase();
  if (!(COST_CURRENCIES as readonly string[]).includes(currency)) throw new Error("Moeda inválida.");

  const amountCents = Math.round(input.amountCents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    throw new Error("Informe um valor maior que zero.");
  }

  // Em real os dois valores são o mesmo número; em dólar, o valor em real é o
  // que caiu na fatura do cartão e precisa vir preenchido.
  const amountBrlCents = currency === "BRL" ? amountCents : Math.round(input.amountBrlCents ?? 0);
  if (!Number.isFinite(amountBrlCents) || amountBrlCents <= 0) {
    throw new Error("Informe quanto essa cobrança deu em real.");
  }

  const description = input.description?.trim() || null;
  if (description && description.length > 120) throw new Error("Descrição muito longa (máx. 120).");

  return { service, description, chargedAt: parseChargedAt(input.chargedAt), amountCents, currency, amountBrlCents };
}

/**
 * Lançamentos do período (mais recentes primeiro) com os totais já prontos.
 *
 * @param from "YYYY-MM-DD" inclusive; omitido = desde sempre.
 * @param to   "YYYY-MM-DD" inclusive; omitido = sem limite.
 */
export async function listProjectCosts(from?: string, to?: string): Promise<CostsSummary> {
  await requirePermission("view_costs");

  const where: { chargedAt?: { gte?: Date; lte?: Date } } = {};
  if (from || to) {
    where.chargedAt = {};
    if (from) where.chargedAt.gte = parseChargedAt(from);
    if (to) where.chargedAt.lte = parseChargedAt(to);
  }

  const rows = await db.projectCost.findMany({
    where,
    orderBy: [{ chargedAt: "desc" }, { createdAt: "desc" }],
  });

  const entries = rows.map(toDTO);
  const totalBrlCents = entries.reduce((acc, e) => acc + e.amountBrlCents, 0);

  const serviceMap = new Map<string, { totalBrlCents: number; count: number }>();
  const monthMap = new Map<string, number>();
  for (const e of entries) {
    const s = serviceMap.get(e.service) ?? { totalBrlCents: 0, count: 0 };
    serviceMap.set(e.service, { totalBrlCents: s.totalBrlCents + e.amountBrlCents, count: s.count + 1 });
    // Fatia o ISO direto: a data foi gravada ao meio-dia UTC de propósito, então
    // o mês não escorrega por fuso.
    const month = e.chargedAt.slice(0, 7);
    monthMap.set(month, (monthMap.get(month) ?? 0) + e.amountBrlCents);
  }

  return {
    entries,
    totalBrlCents,
    byService: [...serviceMap.entries()]
      .map(([service, v]) => ({ service, ...v }))
      .sort((a, b) => b.totalBrlCents - a.totalBrlCents),
    byMonth: [...monthMap.entries()]
      .map(([month, totalBrlCents]) => ({ month, totalBrlCents }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

export async function createProjectCost(input: CostInput): Promise<ProjectCostDTO> {
  const ctx = await requirePermission("view_costs");
  const data = validate(input);
  return toDTO(await db.projectCost.create({ data: { ...data, createdById: ctx.userId } }));
}

export async function updateProjectCost(id: string, input: CostInput): Promise<ProjectCostDTO> {
  await requirePermission("view_costs");
  const data = validate(input);
  return toDTO(await db.projectCost.update({ where: { id }, data }));
}

export async function deleteProjectCost(id: string): Promise<{ ok: true }> {
  await requirePermission("view_costs");
  await db.projectCost.delete({ where: { id } });
  return { ok: true };
}

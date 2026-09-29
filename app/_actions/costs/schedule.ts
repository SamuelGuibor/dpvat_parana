"use server";

import { Prisma } from "@prisma/client";
import { db } from "@/app/_shared/lib/prisma";
import { requirePermission } from "@/app/_shared/lib/permissions-server";
import { COST_CURRENCIES, COST_SERVICE_KEYS, PAYMENT_RECURRENCES } from "@/app/_shared/lib/costs";
import { readFx } from "@/app/_shared/lib/cost-sync";
import { brDayKey } from "@/app/_shared/utils/date-br";
import {
  addMonthsKey, occurrencesForMonth, type Occurrence, type ScheduleLite,
} from "@/app/_shared/utils/payment-calendar";

// CALENDÁRIO DE PAGAMENTOS (24/09/2026): contas recorrentes com janela de
// vencimento e faixa de valor. "Marcar pago" cria uma ProjectCost vinculada
// (scheduleId + periodKey) — é a mesma fatura manual do painel de Custos, então
// os totais já a incluem sem contar duas vezes. Desmarcar apaga essa fatura.
//
// O "consumo do ciclo" vem de cost_snapshots (APIs dos provedores): soma do
// mês que termina no vencimento, pra saber quanto a fatura deve dar.

export interface PaymentScheduleDTO {
  id: string;
  service: string;
  description: string | null;
  dayFrom: number;
  dayTo: number;
  minCents: number;
  maxCents: number;
  currency: string;
  recurrence: string;
  month: number | null;
  startMonth: string;
  active: boolean;
  notes: string | null;
}

export interface PaymentRecordDTO {
  id: string;
  /** "YYYY-MM-DD" do dia em que foi pago. */
  paidOn: string;
  amountCents: number;
  currency: string;
  amountBrlCents: number;
  description: string | null;
}

export interface OccurrenceDTO extends Occurrence {
  payment: PaymentRecordDTO | null;
  /** Consumo do ciclo em centavos de REAL pelas APIs; null = sem dados do provedor. */
  cycleConsumedBrlCents: number | null;
}

/** Fatura lançada sem conta do calendário (recarga avulsa, excedente...). */
export interface LooseInvoiceDTO {
  id: string;
  service: string;
  /** "YYYY-MM-DD" da cobrança. */
  day: string;
  amountCents: number;
  currency: string;
  amountBrlCents: number;
  description: string | null;
}

export interface PaymentCalendarData {
  month: string;
  today: string;
  fxRate: number;
  schedules: PaymentScheduleDTO[];
  /** Ocorrências do mês exibido. */
  occurrences: OccurrenceDTO[];
  /** Não pagas com vencimento nos próximos 7 dias (independe do mês exibido). */
  upcoming: OccurrenceDTO[];
  /** Não pagas com janela vencida nos últimos 3 meses. */
  overdue: OccurrenceDTO[];
  /** Faturas do mês exibido que não pertencem a nenhuma conta do calendário. */
  looseInvoices: LooseInvoiceDTO[];
  /** Mês exibido, em centavos de REAL. `looseBrlCents` = soma das avulsas. */
  totals: { expectedMinBrlCents: number; expectedMaxBrlCents: number; paidBrlCents: number; looseBrlCents: number };
}

export interface PaymentScheduleInput {
  service: string;
  description?: string | null;
  dayFrom: number;
  dayTo: number;
  minCents: number;
  maxCents: number;
  currency: string;
  recurrence: string;
  month?: number | null;
  startMonth: string;
  notes?: string | null;
}

export interface MarkPaidInput {
  scheduleId: string;
  periodKey: string;
  /** "YYYY-MM-DD" */
  paidOn: string;
  amountCents: number;
  currency: string;
  /** Obrigatório quando currency != BRL (o que caiu no cartão). */
  amountBrlCents?: number | null;
  note?: string | null;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function toBrl(amountCents: number, currency: string, fx: number): number {
  return currency === "USD" ? Math.round(amountCents * fx) : amountCents;
}

/** "YYYY-MM-DD" ao MEIO-DIA UTC — mesma convenção das faturas manuais. */
function parseDay(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) throw new Error("Data inválida.");
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
  if (Number.isNaN(d.getTime())) throw new Error("Data inválida.");
  return d;
}

function toScheduleDTO(s: PaymentScheduleDTO): PaymentScheduleDTO {
  return {
    id: s.id, service: s.service, description: s.description, dayFrom: s.dayFrom, dayTo: s.dayTo,
    minCents: s.minCents, maxCents: s.maxCents, currency: s.currency, recurrence: s.recurrence,
    month: s.month, startMonth: s.startMonth, active: s.active, notes: s.notes,
  };
}

function validateSchedule(input: PaymentScheduleInput) {
  const service = input.service.trim();
  if (!COST_SERVICE_KEYS.includes(service)) throw new Error("Serviço inválido.");
  const currency = input.currency.trim().toUpperCase();
  if (!(COST_CURRENCIES as readonly string[]).includes(currency)) throw new Error("Moeda inválida.");
  const recurrence = input.recurrence;
  if (!PAYMENT_RECURRENCES.some((r) => r.key === recurrence)) throw new Error("Recorrência inválida.");

  const dayFrom = Math.round(input.dayFrom);
  const dayTo = Math.round(input.dayTo);
  if (!(dayFrom >= 1 && dayFrom <= 31 && dayTo >= 1 && dayTo <= 31)) throw new Error("Dias devem ficar entre 1 e 31.");

  const minCents = Math.round(input.minCents);
  const maxCents = Math.round(input.maxCents);
  if (!(minCents >= 0 && maxCents > 0)) throw new Error("Informe o valor esperado.");
  if (minCents > maxCents) throw new Error("O valor mínimo não pode passar do máximo.");

  if (!MONTH_RE.test(input.startMonth)) throw new Error("Mês de início inválido.");
  let month: number | null = null;
  if (recurrence === "YEARLY") {
    month = Math.round(Number(input.month));
    if (!(month >= 1 && month <= 12)) throw new Error("Escolha o mês da cobrança anual.");
  }
  if (recurrence === "ONCE") month = Number(input.startMonth.slice(5, 7));

  const description = input.description?.trim() || null;
  if (description && description.length > 120) throw new Error("Descrição muito longa (máx. 120).");
  const notes = input.notes?.trim() || null;
  if (notes && notes.length > 500) throw new Error("Observação muito longa (máx. 500).");

  return { service, description, dayFrom, dayTo, minCents, maxCents, currency, recurrence, month, startMonth: input.startMonth, notes };
}

/** Calendário do mês + pendências (próximos 7 dias e atrasados). */
export async function listPaymentCalendar(month?: string): Promise<PaymentCalendarData> {
  await requirePermission("view_costs");

  const today = brDayKey();
  const todayMonth = today.slice(0, 7);
  const viewMonth = month && MONTH_RE.test(month) ? month : todayMonth;

  // Meses que alimentam a tela: o exibido + 3 para trás (atrasados) + 1 para a
  // frente (próximos 7 dias podem virar o mês).
  const months = new Set<string>([viewMonth, todayMonth, addMonthsKey(todayMonth, 1)]);
  for (let i = 1; i <= 3; i++) months.add(addMonthsKey(todayMonth, -i));

  // chargedAt é gravado ao meio-dia UTC: o intervalo UTC do mês não escorrega.
  const [vy, vm] = viewMonth.split("-").map(Number);
  const [fx, rows, payments, looseRows] = await Promise.all([
    readFx(),
    db.paymentSchedule.findMany({ orderBy: [{ active: "desc" }, { dayFrom: "asc" }, { service: "asc" }] }),
    db.projectCost.findMany({ where: { scheduleId: { not: null }, periodKey: { in: [...months] } } }),
    db.projectCost.findMany({
      where: { scheduleId: null, chargedAt: { gte: new Date(Date.UTC(vy, vm - 1, 1)), lt: new Date(Date.UTC(vy, vm, 1)) } },
      orderBy: { chargedAt: "asc" },
    }),
  ]);

  const schedules = rows.map(toScheduleDTO);
  const lite: ScheduleLite[] = schedules;
  const payMap = new Map<string, PaymentRecordDTO>();
  for (const p of payments) {
    payMap.set(`${p.scheduleId}|${p.periodKey}`, {
      id: p.id,
      paidOn: p.chargedAt.toISOString().slice(0, 10), // meio-dia UTC: não escorrega
      amountCents: p.amountCents,
      currency: p.currency,
      amountBrlCents: p.amountBrlCents,
      description: p.description,
    });
  }
  const paidSet = new Set(payMap.keys());

  const byMonth = new Map<string, Occurrence[]>();
  for (const m of months) byMonth.set(m, occurrencesForMonth(lite, m, today, paidSet));

  // Consumo pelas APIs: uma consulta só, do início do ciclo mais antigo até hoje.
  const all = [...byMonth.values()].flat();
  const minCycle = all.reduce((acc, o) => (o.cycleFrom < acc ? o.cycleFrom : acc), today);
  const scheduleService = new Map(schedules.map((s) => [s.id, s.service]));
  const services = [...new Set(schedules.map((s) => s.service))];
  const snaps = services.length
    ? await db.costSnapshot.findMany({ where: { service: { in: services }, day: { gte: minCycle, lte: today } } })
    : [];
  const snapsBySvc = new Map<string, { day: string; brl: number }[]>();
  for (const s of snaps) {
    const list = snapsBySvc.get(s.service) ?? [];
    list.push({ day: s.day, brl: toBrl(s.amountCents, s.currency, fx.rate) });
    snapsBySvc.set(s.service, list);
  }

  const enrich = (o: Occurrence): OccurrenceDTO => {
    const list = snapsBySvc.get(scheduleService.get(o.scheduleId) ?? "");
    let consumed: number | null = null;
    if (list && o.cycleFrom <= today) {
      const inCycle = list.filter((x) => x.day >= o.cycleFrom && x.day <= o.cycleTo);
      if (inCycle.length) consumed = inCycle.reduce((a, x) => a + x.brl, 0);
    }
    return { ...o, payment: payMap.get(`${o.scheduleId}|${o.periodKey}`) ?? null, cycleConsumedBrlCents: consumed };
  };

  const occurrences = (byMonth.get(viewMonth) ?? []).map(enrich);
  const upcoming = all
    .filter((o) => (o.status === "aberto" || o.status === "futuro") && o.daysToDue <= 7)
    .sort((a, b) => a.to.localeCompare(b.to))
    .map(enrich);
  const overdue = all
    .filter((o) => o.status === "atrasado")
    .sort((a, b) => a.to.localeCompare(b.to))
    .map(enrich);

  const schedById = new Map(schedules.map((s) => [s.id, s]));
  const looseInvoices: LooseInvoiceDTO[] = looseRows.map((r) => ({
    id: r.id, service: r.service, day: r.chargedAt.toISOString().slice(0, 10), amountCents: r.amountCents,
    currency: r.currency, amountBrlCents: r.amountBrlCents, description: r.description,
  }));
  const totals = {
    expectedMinBrlCents: 0, expectedMaxBrlCents: 0, paidBrlCents: 0,
    looseBrlCents: looseInvoices.reduce((a, x) => a + x.amountBrlCents, 0),
  };
  for (const o of occurrences) {
    const s = schedById.get(o.scheduleId);
    if (!s) continue;
    totals.expectedMinBrlCents += toBrl(s.minCents, s.currency, fx.rate);
    totals.expectedMaxBrlCents += toBrl(s.maxCents, s.currency, fx.rate);
    if (o.payment) totals.paidBrlCents += o.payment.amountBrlCents;
  }

  return { month: viewMonth, today, fxRate: fx.rate, schedules, occurrences, upcoming: dedupe(upcoming), overdue: dedupe(overdue), looseInvoices, totals };
}

function dedupe(list: OccurrenceDTO[]): OccurrenceDTO[] {
  const seen = new Set<string>();
  return list.filter((o) => {
    const k = `${o.scheduleId}|${o.periodKey}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function savePaymentSchedule(input: PaymentScheduleInput, id?: string | null): Promise<PaymentScheduleDTO> {
  const ctx = await requirePermission("view_costs");
  const data = validateSchedule(input);
  const row = id
    ? await db.paymentSchedule.update({ where: { id }, data })
    : await db.paymentSchedule.create({ data: { ...data, createdById: ctx.userId } });
  return toScheduleDTO(row);
}

export async function setPaymentScheduleActive(id: string, active: boolean): Promise<{ ok: true }> {
  await requirePermission("view_costs");
  await db.paymentSchedule.update({ where: { id }, data: { active } });
  return { ok: true };
}

/** Apaga a conta; os pagamentos já feitos continuam como faturas manuais. */
export async function deletePaymentSchedule(id: string): Promise<{ ok: true }> {
  await requirePermission("view_costs");
  await db.paymentSchedule.delete({ where: { id } });
  return { ok: true };
}

export async function markPaymentPaid(input: MarkPaidInput): Promise<PaymentRecordDTO> {
  const ctx = await requirePermission("view_costs");
  if (!MONTH_RE.test(input.periodKey)) throw new Error("Mês inválido.");
  const schedule = await db.paymentSchedule.findUnique({ where: { id: input.scheduleId } });
  if (!schedule) throw new Error("Conta não encontrada — recarregue a tela.");

  const currency = input.currency.trim().toUpperCase();
  if (!(COST_CURRENCIES as readonly string[]).includes(currency)) throw new Error("Moeda inválida.");
  const amountCents = Math.round(input.amountCents);
  if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error("Informe um valor maior que zero.");
  const amountBrlCents = currency === "BRL" ? amountCents : Math.round(input.amountBrlCents ?? 0);
  if (!Number.isFinite(amountBrlCents) || amountBrlCents <= 0) throw new Error("Informe quanto deu em real.");
  const description = input.note?.trim() || schedule.description || null;
  if (description && description.length > 120) throw new Error("Observação muito longa (máx. 120).");

  try {
    const row = await db.projectCost.create({
      data: {
        service: schedule.service,
        description,
        chargedAt: parseDay(input.paidOn),
        amountCents,
        currency,
        amountBrlCents,
        scheduleId: schedule.id,
        periodKey: input.periodKey,
        createdById: ctx.userId,
      },
    });
    return {
      id: row.id, paidOn: row.chargedAt.toISOString().slice(0, 10), amountCents: row.amountCents,
      currency: row.currency, amountBrlCents: row.amountBrlCents, description: row.description,
    };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new Error("Esse mês já está marcado como pago.");
    }
    throw e;
  }
}

/** Desfaz o "pago": apaga a fatura vinculada àquele mês. */
export async function unmarkPaymentPaid(scheduleId: string, periodKey: string): Promise<{ ok: true }> {
  await requirePermission("view_costs");
  await db.projectCost.deleteMany({ where: { scheduleId, periodKey } });
  return { ok: true };
}

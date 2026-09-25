// Calendário de pagamentos (24/09/2026) — lógica pura, sem banco nem fuso.
// Tudo trabalha com chaves "YYYY-MM-DD"/"YYYY-MM"; quem chama passa o "hoje"
// já em Brasília (brDayKey), porque a Vercel roda em UTC.

export type PaymentRecurrence = 'MONTHLY' | 'YEARLY' | 'ONCE';

export interface ScheduleLite {
  id: string;
  dayFrom: number;
  dayTo: number;
  recurrence: string;
  /** YEARLY/ONCE: mês (1..12) do vencimento. */
  month: number | null;
  /** "YYYY-MM" — a partir de quando a conta existe (ONCE = o único mês). */
  startMonth: string;
  active: boolean;
}

export type OccurrenceStatus = 'pago' | 'atrasado' | 'aberto' | 'futuro';

export interface Occurrence {
  scheduleId: string;
  /** Mês de referência "YYYY-MM" (chave do pagamento). */
  periodKey: string;
  /** Janela de vencimento, inclusive. `to` pode cair no mês seguinte. */
  from: string;
  to: string;
  status: OccurrenceStatus;
  /** Dias até o fim da janela (negativo = atrasado há N dias). */
  daysToDue: number;
  /** Ciclo de consumo que essa cobrança paga: o mês que termina em `to`. */
  cycleFrom: string;
  cycleTo: string;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function daysInMonthKey(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addMonthsKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** Dia do mês limitado ao último dia (31 em fevereiro vira 28/29). */
export function clampDay(monthKey: string, day: number): string {
  return `${monthKey}-${pad(Math.min(Math.max(1, day), daysInMonthKey(monthKey)))}`;
}

export function addDaysKey(dayKey: string, delta: number): string {
  const [y, m, d] = dayKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + delta));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function diffDaysKey(a: string, b: string): number {
  const toMs = (k: string) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toMs(b) - toMs(a)) / 86_400_000);
}

/** A conta cai nesse mês? */
export function occursIn(s: ScheduleLite, monthKey: string): boolean {
  if (!s.active) return false;
  if (s.recurrence === 'ONCE') return monthKey === s.startMonth;
  if (monthKey < s.startMonth) return false;
  if (s.recurrence === 'YEARLY') return Number(monthKey.slice(5, 7)) === s.month;
  return true;
}

/** Janela de vencimento da conta no mês. "28 a 3" fecha no mês seguinte. */
export function windowFor(s: Pick<ScheduleLite, 'dayFrom' | 'dayTo'>, monthKey: string): { from: string; to: string } {
  const from = clampDay(monthKey, s.dayFrom);
  const to = s.dayTo >= s.dayFrom ? clampDay(monthKey, s.dayTo) : clampDay(addMonthsKey(monthKey, 1), s.dayTo);
  return { from, to };
}

/**
 * Ocorrências do mês com status. `paidPeriods` = conjunto "scheduleId|YYYY-MM"
 * dos meses já pagos.
 */
export function occurrencesForMonth(
  schedules: ScheduleLite[],
  monthKey: string,
  todayKey: string,
  paidPeriods: Set<string>,
): Occurrence[] {
  const out: Occurrence[] = [];
  for (const s of schedules) {
    if (!occursIn(s, monthKey)) continue;
    const { from, to } = windowFor(s, monthKey);
    const daysToDue = diffDaysKey(todayKey, to);
    let status: OccurrenceStatus;
    if (paidPeriods.has(`${s.id}|${monthKey}`)) status = 'pago';
    else if (todayKey > to) status = 'atrasado';
    else if (todayKey >= from) status = 'aberto';
    else status = 'futuro';
    const prev = addMonthsKey(to.slice(0, 7), -1);
    const cycleFrom = addDaysKey(clampDay(prev, Number(to.slice(8, 10))), 1);
    out.push({ scheduleId: s.id, periodKey: monthKey, from, to, status, daysToDue, cycleFrom, cycleTo: to });
  }
  return out.sort((a, b) => (a.from === b.from ? a.to.localeCompare(b.to) : a.from.localeCompare(b.from)));
}

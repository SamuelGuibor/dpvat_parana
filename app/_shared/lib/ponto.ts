// Regras do controle de ponto — puro (sem banco/sessão), importável no client
// e no server para que a UI e a API calculem exatamente a mesma coisa.
//
// Modelo do dia: uma WorkSession por (usuário, dia de Brasília). O trabalho é
// o intervalo `startedAt → finishedAt` MENOS a soma das pausas. Pausas são uma
// lista (`breaks`), não um par único — dá pra sair pro almoço, voltar, tomar
// um café e voltar de novo no mesmo dia.
//
// Compatibilidade: registros antigos só têm `pausedAt`/`resumedAt`. Eles são
// lidos como uma pausa só (ver `parseBreaks`), e toda escrita nova espelha a
// primeira pausa nesses campos para não quebrar nada que ainda os leia.

import { brStartOfDay } from '@/app/_shared/utils/date-br';

export type BreakKind = 'almoco' | 'pausa';

export interface PontoBreak {
  /** ISO do início da pausa. */
  start: string;
  /** ISO do fim; null enquanto a pausa está em curso. */
  end: string | null;
  kind: BreakKind;
}

export interface PontoSession {
  id: string;
  userId: string;
  discordId: string;
  /** Chave de dia "YYYY-MM-DD" no fuso de Brasília. */
  date: string;
  startedAt: string | null;
  pausedAt: string | null;
  resumedAt: string | null;
  finishedAt: string | null;
  isActive: boolean;
  isPaused: boolean;
  breaks?: unknown;
  note?: string | null;
  autoClosed?: boolean;
  editedById?: string | null;
  editedAt?: string | null;
  user?: { id: string; name: string | null; role: string; image?: string | null } | null;
}

export const BREAK_LABEL: Record<BreakKind, string> = {
  almoco: 'Almoço',
  pausa: 'Pausa',
};

/* ------------------------------------------------------------------ */
/* Tempo                                                               */
/* ------------------------------------------------------------------ */

const ms = (iso: string | Date) => new Date(iso).getTime();

/** Instante das 00:00 (Brasília) da chave de dia informada. */
export function dayStartMs(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  // O meio-dia UTC evita que o offset empurre a data para o dia vizinho antes
  // de `brStartOfDay` reancorar no fuso de Brasília.
  return brStartOfDay(new Date(Date.UTC(y, m - 1, d, 12))).getTime();
}

/** Último milissegundo (Brasília) da chave de dia informada. */
export function dayEndMs(dateKey: string): number {
  return dayStartMs(dateKey) + 86_400_000 - 1;
}

/** Minutos desde a meia-noite (Brasília) do dia da sessão. */
export function minutesIntoDay(iso: string, dateKey: string): number {
  return Math.round((ms(iso) - dayStartMs(dateKey)) / 60_000);
}

/* ------------------------------------------------------------------ */
/* Pausas                                                              */
/* ------------------------------------------------------------------ */

function isBreakKind(v: unknown): v is BreakKind {
  return v === 'almoco' || v === 'pausa';
}

/** Normaliza o campo `breaks`, caindo no par legado pausedAt/resumedAt. */
export function parseBreaks(ws: Pick<PontoSession, 'breaks' | 'pausedAt' | 'resumedAt'>): PontoBreak[] {
  const raw = ws.breaks;

  if (Array.isArray(raw)) {
    const list: PontoBreak[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      if (typeof o.start !== 'string' || Number.isNaN(ms(o.start))) continue;
      const end = typeof o.end === 'string' && !Number.isNaN(ms(o.end)) ? o.end : null;
      list.push({ start: o.start, end, kind: isBreakKind(o.kind) ? o.kind : 'pausa' });
    }
    return list.sort((a, b) => ms(a.start) - ms(b.start));
  }

  if (ws.pausedAt) {
    return [{ start: new Date(ws.pausedAt).toISOString(), end: ws.resumedAt ? new Date(ws.resumedAt).toISOString() : null, kind: 'almoco' }];
  }

  return [];
}

/** A pausa em curso, se houver. */
export function openBreak(ws: PontoSession): PontoBreak | null {
  return parseBreaks(ws).find((b) => !b.end) ?? null;
}

/* ------------------------------------------------------------------ */
/* Totais                                                              */
/* ------------------------------------------------------------------ */

/** Fim efetivo do dia: o encerramento, ou "agora" limitado à virada do dia. */
export function effectiveEndMs(ws: PontoSession, now = Date.now()): number {
  if (ws.finishedAt) return ms(ws.finishedAt);
  return Math.min(now, dayEndMs(ws.date));
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Milissegundos em pausa no dia (as pausas em curso contam até agora). */
export function breakMs(ws: PontoSession, now = Date.now()): number {
  if (!ws.startedAt) return 0;
  const start = ms(ws.startedAt);
  const end = effectiveEndMs(ws, now);
  let total = 0;
  for (const b of parseBreaks(ws)) {
    const bs = clamp(ms(b.start), start, end);
    const be = clamp(b.end ? ms(b.end) : end, start, end);
    total += Math.max(0, be - bs);
  }
  return total;
}

/** Milissegundos efetivamente trabalhados (jornada menos pausas). */
export function workedMs(ws: PontoSession, now = Date.now()): number {
  if (!ws.startedAt) return 0;
  const gross = Math.max(0, effectiveEndMs(ws, now) - ms(ws.startedAt));
  return Math.max(0, gross - breakMs(ws, now));
}

/** Minutos em pausa no dia. */
export function breakMinutes(ws: PontoSession, now = Date.now()): number {
  return Math.floor(breakMs(ws, now) / 60_000);
}

/** Minutos efetivamente trabalhados no dia (jornada menos pausas). */
export function workedMinutes(ws: PontoSession, now = Date.now()): number {
  return Math.floor(workedMs(ws, now) / 60_000);
}

/** Jornada bruta (do início ao fim, pausas incluídas). */
export function spanMinutes(ws: PontoSession, now = Date.now()): number {
  if (!ws.startedAt) return 0;
  return Math.max(0, Math.floor((effectiveEndMs(ws, now) - ms(ws.startedAt)) / 60_000));
}

export type PontoStatus = 'nao_iniciado' | 'trabalhando' | 'pausa' | 'encerrado';

export function statusOf(ws: PontoSession | null): PontoStatus {
  if (!ws || !ws.startedAt) return 'nao_iniciado';
  if (ws.finishedAt) return 'encerrado';
  if (openBreak(ws)) return 'pausa';
  return 'trabalhando';
}

export const STATUS_LABEL: Record<PontoStatus, string> = {
  nao_iniciado: 'Não iniciado',
  trabalhando: 'Trabalhando',
  pausa: 'Em pausa',
  encerrado: 'Turno encerrado',
};

/* ------------------------------------------------------------------ */
/* Jornada esperada / banco de horas                                   */
/* ------------------------------------------------------------------ */

export interface WorkSchedule {
  /** Meta de minutos trabalhados por dia útil. */
  dailyMinutes: number;
  /** Dias da semana que contam como úteis (0=domingo). */
  days: number[];
  /**
   * Escala de referência (16/08/2026): horários previstos de entrada/saída e
   * intervalo. Quando presentes, `dailyMinutes` = (saída − entrada) − intervalo
   * — a ScheduleDialog calcula; aqui só armazenamos e validamos.
   */
  startTime?: string | null;    // "08:30"
  endTime?: string | null;      // "14:30"
  breakMinutes?: number | null; // intervalo em minutos (ex.: 60)
  /**
   * Início do ciclo do banco de horas (YYYY-MM-DD). Sessões e compensações
   * anteriores a esta data ficam fora do saldo acumulado. Null = desde o
   * primeiro registro do colaborador.
   */
  bankStartKey?: string | null;
}

export const DEFAULT_SCHEDULE: WorkSchedule = { dailyMinutes: 480, days: [1, 2, 3, 4, 5] };

export const WEEKDAY_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const HHMM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const DAYKEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function parseSchedule(raw: unknown): WorkSchedule {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_SCHEDULE };
  const o = raw as Record<string, unknown>;
  const daily = typeof o.dailyMinutes === 'number' && o.dailyMinutes > 0 && o.dailyMinutes <= 1440
    ? Math.round(o.dailyMinutes)
    : DEFAULT_SCHEDULE.dailyMinutes;
  const days = Array.isArray(o.days)
    ? [...new Set(o.days.filter((d): d is number => typeof d === 'number' && d >= 0 && d <= 6))].sort()
    : DEFAULT_SCHEDULE.days;
  const startTime = typeof o.startTime === 'string' && HHMM_RE.test(o.startTime) ? o.startTime : null;
  const endTime = typeof o.endTime === 'string' && HHMM_RE.test(o.endTime) ? o.endTime : null;
  const breakMin = typeof o.breakMinutes === 'number' && o.breakMinutes >= 0 && o.breakMinutes <= 720
    ? Math.round(o.breakMinutes)
    : null;
  const bankStartKey = typeof o.bankStartKey === 'string' && DAYKEY_RE.test(o.bankStartKey) ? o.bankStartKey : null;
  return {
    dailyMinutes: daily,
    days: days.length ? days : DEFAULT_SCHEDULE.days,
    startTime,
    endTime,
    breakMinutes: breakMin,
    bankStartKey,
  };
}

/** Dia da semana (0=domingo) de uma chave "YYYY-MM-DD", sem susto de fuso. */
export function weekdayOf(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Meta do dia — 0 em dia não útil. */
export function targetMinutes(dateKey: string, schedule: WorkSchedule): number {
  return schedule.days.includes(weekdayOf(dateKey)) ? schedule.dailyMinutes : 0;
}

/** Todas as chaves de dia de um mês "YYYY-MM". */
export function daysOfMonth(monthKey: string): string[] {
  const [y, m] = monthKey.split('-').map(Number);
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: total }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, '0')}`);
}

export interface MonthSummary {
  worked: number;
  /** Meta acumulada dos dias úteis já decorridos. */
  expected: number;
  /** worked − expected. Positivo = crédito. */
  balance: number;
  /** Dias com registro de entrada. */
  daysWorked: number;
  /** Dias úteis já decorridos sem nenhum registro. */
  missingDays: string[];
  /** Média de minutos por dia registrado. */
  avgPerDay: number;
  breakTotal: number;
}

/**
 * Fecha o mês. `todayKey` corta a meta no dia de hoje (não cobra o futuro).
 * `onlyRegistered=true` calcula a meta só sobre os dias com registro — útil
 * para quem entrou no meio do mês ou tirou férias.
 */
export function monthSummary(
  sessions: PontoSession[],
  schedule: WorkSchedule,
  monthKey: string,
  todayKey: string,
  onlyRegistered = false,
  now = Date.now(),
): MonthSummary {
  const byDate = new Map(sessions.map((s) => [s.date, s]));
  let worked = 0;
  let expected = 0;
  let breakTotal = 0;
  let daysWorked = 0;
  const missingDays: string[] = [];

  for (const day of daysOfMonth(monthKey)) {
    if (day > todayKey) break;
    const ws = byDate.get(day);
    const registered = !!ws?.startedAt;

    if (registered) {
      worked += workedMinutes(ws, now);
      breakTotal += breakMinutes(ws, now);
      daysWorked += 1;
    }

    const target = targetMinutes(day, schedule);
    if (target > 0) {
      if (registered) expected += target;
      else if (!onlyRegistered) { expected += target; missingDays.push(day); }
      else missingDays.push(day);
    }
  }

  return {
    worked,
    expected,
    balance: worked - expected,
    daysWorked,
    missingDays,
    avgPerDay: daysWorked ? Math.round(worked / daysWorked) : 0,
    breakTotal,
  };
}

/* ------------------------------------------------------------------ */
/* Banco de horas acumulado                                            */
/* ------------------------------------------------------------------ */

export interface PontoAdjustmentLite {
  /** Chave de dia "YYYY-MM-DD". */
  date: string;
  /** Minutos COM SINAL: compensação nasce negativa, abono positivo. */
  minutes: number;
  /** compensation (folga que abate crédito) | credit (abono que credita). */
  kind: string;
}

export interface BankSummary {
  /** Saldo acumulado do ciclo: Σ(trabalhado − meta) dos dias com registro + ajustes. */
  accumulated: number;
  /** Horas compensadas no ciclo (valor absoluto das compensações). */
  compensated: number;
  /** Início do ciclo (bankStartKey da escala, ou o primeiro registro). */
  startKey: string | null;
  /** Meses completos desde o início do ciclo. */
  monthsOld: number;
  /** true a partir de 5 meses de ciclo (CLT: banco fecha em 6). */
  alert: boolean;
}

function monthsBetween(startKey: string, todayKey: string): number {
  const [sy, sm, sd] = startKey.split('-').map(Number);
  const [ty, tm, td] = todayKey.split('-').map(Number);
  let months = (ty - sy) * 12 + (tm - sm);
  if (td < sd) months -= 1;
  return Math.max(0, months);
}

/**
 * Saldo do banco de horas de um colaborador desde o início do ciclo.
 * Dias SEM registro não geram débito (férias/atestado não penalizam) — falta
 * injustificada entra no banco via compensação/ajuste manual do gestor.
 */
export function bankSummary(
  allSessions: PontoSession[],
  adjustments: PontoAdjustmentLite[],
  schedule: WorkSchedule,
  todayKey: string,
  now = Date.now(),
): BankSummary {
  const firstSession = allSessions.reduce<string | null>(
    (min, s) => (s.startedAt && (!min || s.date < min) ? s.date : min),
    null,
  );
  const startKey = schedule.bankStartKey ?? firstSession;

  let accumulated = 0;
  let compensated = 0;

  if (startKey) {
    for (const s of allSessions) {
      if (!s.startedAt || s.date < startKey || s.date > todayKey) continue;
      accumulated += workedMinutes(s, now) - targetMinutes(s.date, schedule);
    }
    for (const a of adjustments) {
      if (a.date < startKey || a.date > todayKey) continue;
      accumulated += a.minutes;
      if (a.kind === 'compensation') compensated += Math.abs(a.minutes);
    }
  }

  const monthsOld = startKey ? monthsBetween(startKey, todayKey) : 0;

  return {
    accumulated,
    compensated,
    startKey,
    monthsOld,
    alert: !!startKey && monthsOld >= 5,
  };
}

/* ------------------------------------------------------------------ */
/* Formatação                                                          */
/* ------------------------------------------------------------------ */

/** "8h05" — total de minutos em horas e minutos. */
export function fmtHm(mins: number): string {
  const sign = mins < 0 ? '-' : '';
  const abs = Math.abs(Math.round(mins));
  return `${sign}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, '0')}`;
}

/** "8:05:31" — relógio vivo do turno em andamento. */
export function fmtHms(msTotal: number): string {
  const s = Math.max(0, Math.floor(msTotal / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** "+1h20" / "−0h35" — saldo com sinal explícito. */
export function fmtSigned(mins: number): string {
  const rounded = Math.round(mins);
  if (rounded === 0) return '0h00';
  return `${rounded > 0 ? '+' : '−'}${fmtHm(Math.abs(rounded))}`;
}

/** "08:32" no fuso de Brasília. */
export function fmtClock(iso: string | null | undefined): string {
  if (!iso) return '--:--';
  return new Date(iso).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "06/08" a partir de uma chave de dia (sem reinterpretar fuso). */
export function fmtDayLabel(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${d}/${m}`;
}

/** "qui, 06/08" a partir de uma chave de dia. */
export function fmtDayLong(dateKey: string): string {
  return `${WEEKDAY_LABEL[weekdayOf(dateKey)]}, ${fmtDayLabel(dateKey)}`;
}

/** "08:32" → ISO absoluto no dia informado (Brasília). Usado na correção manual. */
export function clockToIso(dateKey: string, hhmm: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return new Date(dayStartMs(dateKey) + (h * 60 + m) * 60_000).toISOString();
}

/** ISO → "08:32" para preencher os inputs de correção. */
export function isoToClock(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}

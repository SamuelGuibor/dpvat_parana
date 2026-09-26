// Datas no fuso de Brasília — fonte única para "que dia é hoje".
//
// O problema que isto resolve: em produção (Vercel) o Node roda em UTC, então
// `new Date().getDate()` e `toISOString().slice(0,10)` devolvem o dia UTC. Das
// 21h em diante (horário de Brasília) o servidor já virou o dia, e os gráficos
// abriam um bucket do dia seguinte enquanto aqui ainda era ontem. O mesmo vale
// no navegador para quem não está no fuso do Brasil.
//
// Regra da casa: todo agrupamento por DIA/HORA de dado do CRM passa por aqui.
// (O Brasil não tem mais horário de verão desde 2019, mas o offset é calculado
// pelo Intl mesmo assim — nada de "-03:00" chumbado.)

export const BR_TZ = 'America/Sao_Paulo';

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: BR_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
});
const dayLabelFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: BR_TZ, day: '2-digit', month: '2-digit',
});
const partsFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: BR_TZ, hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Chave de dia "YYYY-MM-DD" no fuso de Brasília. */
export function brDayKey(date: Date | string | number = new Date()): string {
  return dayKeyFmt.format(new Date(date));
}

/** Rótulo curto "06/08" no fuso de Brasília. */
export function brDayLabel(date: Date | string | number): string {
  return dayLabelFmt.format(new Date(date));
}

/** Rótulo curto a partir de uma chave "YYYY-MM-DD" (sem reinterpretar fuso). */
export function brLabelFromKey(key: string): string {
  const [, month, day] = key.split('-');
  return `${day}/${month}`;
}

/** Relógio de Brasília (ano, mês 1..12, dia, hora 0..23, minuto, segundo) no instante. */
function brWallParts(date: Date) {
  const p = Object.fromEntries(
    partsFmt.formatToParts(date).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return {
    year: Number(p.year), month: Number(p.month), day: Number(p.day),
    // Algumas versões do Intl devolvem "24" para a meia-noite com hour12:false.
    hour: Number(p.hour) % 24, minute: Number(p.minute), second: Number(p.second),
  };
}

/** Offset do fuso de Brasília, em minutos, para o instante informado. */
function brOffsetMinutes(date: Date): number {
  const p = brWallParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Zera os milissegundos do instante original: o Intl só chega ao segundo.
  return (asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000;
}

/**
 * Relógio de Brasília (dia/hora "de parede") → instante real. `Date.UTC`
 * normaliza o excesso (dia 31 + 1 vira o dia 1º do mês seguinte), então dá
 * para somar dias direto no `day`.
 */
function brWallToDate(year: number, month: number, day: number, hour: number): Date {
  const asUtc = Date.UTC(year, month - 1, day, hour, 0, 0);
  // Mesma manobra do brStartOfDay: mede o offset no instante alvo e desloca.
  return new Date(asUtc - brOffsetMinutes(new Date(asUtc)) * 60_000);
}

/** Instante das 00:00 (Brasília) do dia que contém `date`. */
export function brStartOfDay(date: Date = new Date()): Date {
  const [y, m, d] = brDayKey(date).split('-').map(Number);
  const midnightAsUtc = Date.UTC(y, m - 1, d, 0, 0, 0);
  const offset = brOffsetMinutes(new Date(midnightAsUtc));
  return new Date(midnightAsUtc - offset * 60_000);
}

/** Instante das 00:00 (Brasília) de N dias atrás — N=0 é hoje. */
export function brStartOfDaysAgo(days: number, from: Date = new Date()): Date {
  const start = brStartOfDay(from);
  // Vai por UTC e re-ancora: cobre eventual mudança de offset no meio.
  const shifted = new Date(start.getTime() - days * 86_400_000);
  return brStartOfDay(shifted);
}

/** Sequência de chaves de dia (Brasília), do mais antigo ao mais recente. */
export function brDayKeySeries(days: number, until: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    keys.push(brDayKey(brStartOfDaysAgo(i, until)));
  }
  return keys;
}

/** Instante das 00:00 (Brasília) do dia 1º do mês que contém `date`. */
export function brStartOfMonth(date: Date = new Date()): Date {
  const [y, m] = brDayKey(date).split('-').map(Number);
  return brStartOfDay(new Date(Date.UTC(y, m - 1, 1, 12, 0, 0)));
}

/** Quantos dias tem o mês (de Brasília) que contém `date`. */
export function brDaysInMonth(date: Date = new Date()): number {
  const [y, m] = brDayKey(date).split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Dia do mês (1..31) no fuso de Brasília. */
export function brDayOfMonth(date: Date = new Date()): number {
  return Number(brDayKey(date).slice(8, 10));
}

/** Índice do mês (0=jan) no fuso de Brasília. */
export function brMonthIndex(date: Date | string | number): number {
  return Number(brDayKey(date).slice(5, 7)) - 1;
}

/** Data "06/08/2026" no fuso de Brasília (para textos e notificações). */
export function brDateBR(date: Date | string | number = new Date()): string {
  return new Date(date).toLocaleDateString('pt-BR', { timeZone: BR_TZ });
}

const monthExtensoFmt = new Intl.DateTimeFormat('pt-BR', { timeZone: BR_TZ, month: 'long' });

/** Mês (1..12) no fuso de Brasília. */
export function brMonth(date: Date | string | number = new Date()): number {
  return Number(brDayKey(date).slice(5, 7));
}

/** Nome do mês por extenso, em português, com inicial maiúscula ("Agosto"). */
export function brMonthNameExtenso(date: Date | string | number = new Date()): string {
  const name = monthExtensoFmt.format(new Date(date));
  return name.charAt(0).toUpperCase() + name.slice(1);
}

/** Ano (4 dígitos) no fuso de Brasília. */
export function brYear(date: Date | string | number = new Date()): number {
  return Number(brDayKey(date).slice(0, 4));
}

/**
 * Variáveis de data prontas para template ([[dia]], [[mes]], [[ano]],
 * [[mes_numerico]]) — usadas nas automações do Kanban (comentário/arquivo
 * gerado). `mes` vem por extenso; `mes_numerico` com dois dígitos.
 */
export function brDateVars(date: Date | string | number = new Date()) {
  return {
    dia: String(brDayOfMonth(new Date(date))),
    mes: brMonthNameExtenso(date),
    mes_numerico: String(brMonth(date)).padStart(2, '0'),
    ano: String(brYear(date)),
  };
}

/**
 * "YYYY-MM-DDTHH:mm" digitado por quem está no Brasil → instante real (UTC).
 *
 * Sem isto, `new Date('2026-08-28T11:00')` é lido no fuso de quem executa: na
 * Vercel (UTC) vira 11:00Z, que o CRM depois mostra como 08:00 de Brasília.
 * Aqui a string é tratada SEMPRE como horário de Brasília, não importa onde o
 * código rode (servidor ou navegador).
 */
export function brLocalToDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value.trim());
  if (!m) return new Date(NaN);
  const asUtc = Date.UTC(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4]), Number(m[5]), m[6] ? Number(m[6]) : 0,
  );
  // Mesma manobra do brStartOfDay: mede o offset no instante alvo e desloca.
  return new Date(asUtc - brOffsetMinutes(new Date(asUtc)) * 60_000);
}

const DAY_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Intervalo de dias "YYYY-MM-DD" de Brasília, INCLUSIVO nas duas pontas →
 * instantes para o banco: `gte` = 00:00 BRT de `fromKey`, `lt` = 00:00 BRT do
 * dia seguinte a `toKey`. Um dia só: `from` = `to`.
 *
 * Sem isto, `new Date('2026-09-01')` é meia-noite UTC (21:00 do dia 31 em
 * Brasília) e o filtro "Este mês" do inbox pegaria 3 h do mês anterior e
 * perderia as 3 últimas horas do dia final. Chave inválida lança (quem chama
 * valida o formato antes; nunca vira "sem filtro" em silêncio).
 */
export function brDayRangeToInstants(fromKey: string, toKey: string): { gte: Date; lt: Date } {
  const a = DAY_KEY_RE.exec(fromKey);
  const b = DAY_KEY_RE.exec(toKey);
  if (!a || !b) throw new RangeError(`Dia inválido: ${fromKey} – ${toKey}`);
  return {
    gte: brWallToDate(Number(a[1]), Number(a[2]), Number(a[3]), 0),
    // Date.UTC normaliza o dia 31 + 1 para o dia 1º do mês seguinte.
    lt: brWallToDate(Number(b[1]), Number(b[2]), Number(b[3]) + 1, 0),
  };
}

/**
 * Instante → { day: "YYYY-MM-DD", time: "HH:mm", second: "ss" } no fuso de
 * Brasília. `second` fica à parte para não mudar o `time` de quem já usa (os
 * campos de hora dos formulários são "HH:mm").
 */
export function brDateTimeParts(
  date: Date | string | number = new Date(),
): { day: string; time: string; second: string } {
  const p = Object.fromEntries(
    partsFmt.formatToParts(new Date(date)).filter((x) => x.type !== 'literal')
      .map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return {
    day: `${p.year}-${p.month}-${p.day}`,
    time: `${String(Number(p.hour) % 24).padStart(2, '0')}:${p.minute}`,
    second: p.second,
  };
}

// ---------------------------------------------------------------------------
// Horário comercial dos crons do WhatsApp: 7h–21h de Brasília, todos os dias.
//
// É a régua de quando o CRM pode mandar mensagem PROATIVA (cutucada de 30 min,
// despedida por silêncio, provocação da recuperação) e de quanto tempo conta no
// SLA humano. Mensagem de madrugada irrita o cliente e pesa na qualidade da
// conta na Meta (as duas WABAs já levaram aviso de spam).
//
// NÃO é o `businessHours()` do bot.ts (seg–sex 8–18, sáb 8–12): aquele vai ao
// cérebro para ele dizer ao cliente quando a equipe atende. São propósitos
// diferentes — não unifique.
// ---------------------------------------------------------------------------

/** Primeira hora (Brasília) em que o cron pode falar com o cliente. */
export const BR_BUSINESS_START_H = 7;
/** Hora (Brasília) em que o cron para de falar — 21:00 já está fora. */
export const BR_BUSINESS_END_H = 21;

/** O instante cai entre 07:00 e 20:59:59 de Brasília? */
export function isBrBusinessHour(ts: number | Date = Date.now()): boolean {
  const { hour } = brWallParts(new Date(ts));
  return hour >= BR_BUSINESS_START_H && hour < BR_BUSINESS_END_H;
}

/**
 * Próximo instante dentro do horário comercial: o próprio `ts` se já estiver
 * dentro; antes das 7h, as 7h do mesmo dia; das 21h em diante, as 7h do dia
 * seguinte (sempre no relógio de Brasília).
 */
export function nextBrBusinessSlot(ts: number | Date = Date.now()): Date {
  const at = new Date(ts);
  const p = brWallParts(at);
  if (p.hour >= BR_BUSINESS_START_H && p.hour < BR_BUSINESS_END_H) return at;
  const addDays = p.hour < BR_BUSINESS_START_H ? 0 : 1;
  return brWallToDate(p.year, p.month, p.day + addDays, BR_BUSINESS_START_H);
}

/** Minutos DE EXPEDIENTE (7h–21h de Brasília) entre dois instantes — a madrugada não conta. */
export function brBusinessMinutesBetween(from: number, to: number): number {
  if (to <= from) return 0;
  let total = 0;
  let cursor = from;
  while (cursor < to) {
    const p = brWallParts(new Date(cursor));
    const open = brWallToDate(p.year, p.month, p.day, BR_BUSINESS_START_H).getTime();
    const close = brWallToDate(p.year, p.month, p.day, BR_BUSINESS_END_H).getTime();
    const segStart = Math.max(cursor, open);
    const segEnd = Math.min(to, close);
    if (segEnd > segStart) total += segEnd - segStart;
    // Pula para a meia-noite seguinte. A trava garante que o laço sempre anda,
    // mesmo se um dia o fuso voltar a ter horário de verão (meia-noite pulada).
    const nextDay = brWallToDate(p.year, p.month, p.day + 1, 0).getTime();
    cursor = nextDay > cursor ? nextDay : cursor + 60 * 60_000;
  }
  return Math.round(total / 60_000);
}

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

/** Offset do fuso de Brasília, em minutos, para o instante informado. */
function brOffsetMinutes(date: Date): number {
  const p = Object.fromEntries(
    partsFmt.formatToParts(date).filter((x) => x.type !== 'literal').map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  );
  // Zera os milissegundos do instante original: o Intl só chega ao segundo.
  return (asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000;
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

// Filtros do board do Kanban (ticket T-Y6ZGE): tag, prazo estourado,
// afastamento vigente e hospital. Tudo roda no navegador sobre os items que o
// polling já trouxe — nada vai ao servidor, então o hash do `/api/board-state`
// não muda com filtro.
//
// Regra pura e testável: o KanbanBoard só monta o estado e chama
// `matchesKanbanFilters`. Contas de dia passam pelo fuso de Brasília
// (`brDayKey`): o navegador pode estar em outro fuso e `getDate()` cru virava
// o dia errado perto da meia-noite.

import { brDayKey } from './date-br';

/** Chave do sessionStorage com os filtros do board (some ao fechar a aba). */
export const KANBAN_FILTERS_STORAGE_KEY = 'kanban-filters';

export interface KanbanFilters {
  /** Ids de CardTag. Card passa se tiver QUALQUER uma delas (OU). */
  tagIds: string[];
  /** Chaves de hospital (`hospitalKey`). Card passa se o hospital for um deles. */
  hospitals: string[];
  /** Só cards com prazo da coluna estourado. */
  overdue: boolean;
  /** Só cards com afastamento vigente (`afastadoAte` hoje ou depois). */
  afastado: boolean;
}

export const EMPTY_KANBAN_FILTERS: KanbanFilters = {
  tagIds: [],
  hospitals: [],
  overdue: false,
  afastado: false,
};

export function hasActiveKanbanFilters(f: KanbanFilters): boolean {
  return f.tagIds.length > 0 || f.hospitals.length > 0 || f.overdue || f.afastado;
}

/** O que a regra precisa do card (Item do board ou KanbanCard). */
export interface FilterableCard {
  statusStartedAt?: string | null;
  afastadoAte?: string | null;
  label?: { timeLimitDays?: number | null } | null;
  hospital?: string | null;
  outro_hospital?: string | null;
}

const DAY_MS = 86_400_000;

/** Dias de calendário entre duas chaves "YYYY-MM-DD" (b − a). */
function dayKeyDiff(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DAY_MS);
}

/**
 * Dias do card na coluna atual, por dia de calendário de Brasília (entrou
 * ontem às 23h = 1 dia hoje). null = sem data ou data inválida. É a mesma
 * conta do selo de tempo do card (`renderTimerBadge`).
 */
export function daysInColumn(statusStartedAt: string | null | undefined, now: Date = new Date()): number | null {
  if (!statusStartedAt) return null;
  const started = new Date(statusStartedAt);
  if (isNaN(started.getTime())) return null;
  return dayKeyDiff(brDayKey(started), brDayKey(now));
}

/** Prazo da coluna (`label.timeLimitDays`) estourado: dias na coluna > limite. */
export function isOverdue(card: FilterableCard, now: Date = new Date()): boolean {
  const limit = card.label?.timeLimitDays ?? null;
  if (limit === null || limit === undefined) return false;
  const days = daysInColumn(card.statusStartedAt, now);
  return days !== null && days > limit;
}

/**
 * Afastamento vigente: `afastadoAte` hoje ou no futuro. O campo é gravado como
 * meia-noite UTC de uma DATA, então compara só a porção "YYYY-MM-DD" com o dia
 * de hoje em Brasília (converter o instante deslocaria um dia para trás).
 * "Vence hoje" ainda conta como afastado, igual ao selo do card.
 */
export function isAfastado(card: FilterableCard, now: Date = new Date()): boolean {
  const iso = card.afastadoAte;
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return false;
  return iso.slice(0, 10) >= brDayKey(now);
}

const OUTRO_RE = /^outros?$/i;

/**
 * Hospital do card para exibir no filtro. O cadastro tem `hospital` (lista) e
 * `outro_hospital` (texto livre quando a lista não tem): "Outro"/vazio cai no
 * texto livre.
 */
export function hospitalOf(card: FilterableCard): string | null {
  const main = (card.hospital ?? '').trim().replace(/\s+/g, ' ');
  if (main && !OUTRO_RE.test(main)) return main;
  const other = (card.outro_hospital ?? '').trim().replace(/\s+/g, ' ');
  return other || null;
}

/** Chave de comparação: sem acento, caixa e espaços extras (o cadastro é digitado à mão). */
export function hospitalKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export interface HospitalOption { key: string; name: string; count: number }

/** Hospitais presentes nos cards, agrupados pela chave, do mais frequente ao menos. */
export function hospitalOptions(cards: readonly FilterableCard[]): HospitalOption[] {
  const map = new Map<string, HospitalOption>();
  for (const c of cards) {
    const name = hospitalOf(c);
    if (!name) continue;
    const key = hospitalKey(name);
    const cur = map.get(key);
    if (cur) cur.count++;
    else map.set(key, { key, name, count: 1 });
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
}

/** O card passa em TODOS os filtros ativos (E entre filtros; OU dentro de tags/hospitais). */
export function matchesKanbanFilters(
  card: FilterableCard,
  tagIds: readonly string[],
  filters: KanbanFilters,
  now: Date = new Date(),
): boolean {
  if (filters.tagIds.length > 0 && !filters.tagIds.some((t) => tagIds.includes(t))) return false;
  if (filters.hospitals.length > 0) {
    const name = hospitalOf(card);
    if (!name || !filters.hospitals.includes(hospitalKey(name))) return false;
  }
  if (filters.overdue && !isOverdue(card, now)) return false;
  if (filters.afastado && !isAfastado(card, now)) return false;
  return true;
}

// Tetos contra lixo no storage (outra versão do código ou DevTools).
const MAX_ITEMS = 50;
const MAX_LEN = 200;

function stringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === 'string' && s.length > 0 && s.length <= MAX_LEN)
    .slice(0, MAX_ITEMS);
}

/** Lê o JSON do sessionStorage; qualquer coisa inválida vira filtro vazio naquele campo. */
export function parseKanbanFilters(raw: string | null | undefined): KanbanFilters {
  if (!raw) return { ...EMPTY_KANBAN_FILTERS };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ...EMPTY_KANBAN_FILTERS };
  }
  if (!data || typeof data !== 'object') return { ...EMPTY_KANBAN_FILTERS };
  const o = data as Record<string, unknown>;
  return {
    tagIds: stringList(o.tagIds),
    hospitals: stringList(o.hospitals),
    overdue: o.overdue === true,
    afastado: o.afastado === true,
  };
}

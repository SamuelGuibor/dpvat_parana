// Regras PURAS das automações do Kanban: como um card é comparado com as
// condições de uma automação, e qual é o "ciclo" de um disparo.
//
// Separado do executor de propósito: aqui não entra Prisma, S3 nem WhatsApp,
// então dá para testar a matemática de prazo (que já errou o sinal e o fuso)
// sem subir banco nenhum.

import type { AutomationCondition } from "./db/automations";
import { brDayKey } from "../utils/date-br";

export type CardData = Record<string, string | boolean | null | undefined | Date>;

export function getVars(card: CardData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(card)) {
    if (v === null || v === undefined) {
      out[k] = "";
    } else if (v instanceof Date) {
      out[k] = v.toLocaleDateString("pt-BR");
    } else {
      out[k] = String(v);
    }
  }
  return out;
}

const MS_DAY = 86_400_000;

/**
 * Lê um campo do card como data. Os campos do card chegam do Prisma como Date,
 * mas um card montado a partir de JSON traz string — daí a conversão.
 * Devolve null para vazio ou data inválida.
 */
function toDate(value: CardData[string]): Date | null {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Dias corridos entre duas datas (arredondado, ignora hora do dia).
function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / MS_DAY);
}

/**
 * Dias de CALENDÁRIO daqui até o vencimento: positivo = ainda faltam N dias,
 * 0 = vence hoje, negativo = venceu há N dias.
 *
 * Duas armadilhas que esta função existe para resolver (27/08/2026 — motivo de
 * NENHUM aviso de prazo ter saído desde que as automações foram criadas):
 *  1. o cálculo antigo invertia o sinal (`daysBetween(due, now) * -1`), então
 *     data FUTURA virava número negativo e `beforeDueDate` nunca batia — e
 *     `afterDueDate`, que deveria disparar depois do vencimento, batia antes;
 *  2. comparar instantes (e não dias) fazia "vence hoje" virar -1 à tarde. A
 *     data de vencimento é gravada como meia-noite UTC do dia digitado no
 *     campo, então o dia dela é o UTC; o "hoje" é o dia de Brasília (a Vercel
 *     roda em UTC e das 21h em diante já virou o dia).
 */
export function daysUntilDue(due: Date, now: Date): number {
  const dueDay = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  const [y, m, d] = brDayKey(now).split("-").map(Number);
  const today = Date.UTC(y, m - 1, d);
  return Math.round((dueDay - today) / MS_DAY);
}

export function evalConditions(
  conds: AutomationCondition[],
  logic: string,
  card: CardData,
  tagNames: string[],
  now: Date = new Date()
): boolean {
  if (conds.length === 0) return true;
  const normalizedTags = tagNames.map((t) => t.toLowerCase().trim());
  const results = conds.map((c) => {
    const cv = c.value.toLowerCase().trim();
    // Campo especial "tags": compara contra a lista de tags do card.
    if (c.field === "tags") {
      switch (c.operator) {
        case "hasTag":
        case "equals":
        case "contains":    return normalizedTags.includes(cv);
        case "notHasTag":
        case "notEquals":   return !normalizedTags.includes(cv);
        case "isEmpty":     return normalizedTags.length === 0;
        case "isNotEmpty":  return normalizedTags.length > 0;
        default:            return false;
      }
    }
    // Campo especial: tempo (dias) que o card está na coluna atual, medido
    // a partir de statusStartedAt.
    if (c.field === "__time_in_column__") {
      const started = toDate(card.statusStartedAt);
      if (!started) return false;
      const days = daysBetween(now, started);
      const threshold = Number(c.value);
      if (Number.isNaN(threshold)) return false;
      if (c.operator === "moreThanDays") return days >= threshold;
      if (c.operator === "lessThanDays") return days < threshold;
      return false;
    }
    // Campo especial: posição de hoje em relação a uma data do card
    // (padrão afastadoAte) — value = nº de dias de folga da data.
    if (c.field === "__due_date__") {
      const dateField = c.dateField || "afastadoAte";
      const dueDate = toDate(card[dateField]);
      if (!dueDate) return false;
      const daysUntil = daysUntilDue(dueDate, now);
      const threshold = Number(c.value);
      if (Number.isNaN(threshold)) return false;
      // "Faltam X dias" bate no DIA EXATO, não em "X ou menos". Com "ou menos"
      // um card que entra na coluna faltando 3 dias fazia as automações de 10,
      // 5 e 2 dias baterem todas na mesma varredura — três avisos que se
      // contradizem, dos quais o cliente só recebia o primeiro (o resto morria
      // no intervalo anti-spam) e todos ficavam marcados como já disparados.
      if (c.operator === "beforeDueDate") return daysUntil === threshold;
      if (c.operator === "afterDueDate") return daysUntil < 0 && Math.abs(daysUntil) >= threshold;
      return false;
    }
    const fv = String(card[c.field] ?? "").toLowerCase().trim();
    switch (c.operator) {
      case "equals":      return fv === cv;
      case "notEquals":   return fv !== cv;
      case "contains":    return fv.includes(cv);
      case "startsWith":  return fv.startsWith(cv);
      case "endsWith":    return fv.endsWith(cv);
      case "isEmpty":     return !fv;
      case "isNotEmpty":  return !!fv;
      default:            return false;
    }
  });
  return logic === "OR" ? results.some(Boolean) : results.every(Boolean);
}

/**
 * Chave do CICLO em que uma automação de tempo dispara para um card.
 *
 * Serve para o disparo único não virar "uma vez na vida": um card cuja data de
 * vencimento mudou (benefício prorrogado, perícia remarcada) é um ciclo NOVO e
 * merece o aviso de novo. Para condição de tempo-na-coluna, o ciclo é a entrada
 * na coluna — voltar pra coluna depois rearma o aviso.
 */
export function fireCycleKey(conds: AutomationCondition[], card: CardData): string {
  const parts: string[] = [];
  for (const c of conds) {
    if (c.field === "__due_date__") {
      const d = toDate(card[c.dateField || "afastadoAte"]);
      parts.push(`due:${d ? d.toISOString().slice(0, 10) : "-"}`);
    } else if (c.field === "__time_in_column__") {
      const d = toDate(card.statusStartedAt);
      parts.push(`col:${d ? d.toISOString().slice(0, 10) : "-"}`);
    }
  }
  return parts.sort().join("|");
}

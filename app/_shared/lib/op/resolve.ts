// Interpretação do que o operador escreve (puro, testado em
// tests/op-resolve.test.ts): referência de card ("processo 2342", "#2342",
// CPF, telefone, id) e nome de coluna sem acento/caixa/hífen.
//
// Coluna não tem slug: o nome do Label é o contrato. Quando o texto casa com
// mais de uma coluna, a ferramenta devolve as candidatas e a skill pergunta —
// nunca escolhe sozinha.

import { BR_TZ, brDateBR, brStartOfDay } from "@/app/_shared/utils/date-br";

export type CardRef =
  | { kind: "cardNumber"; value: number }
  | { kind: "id"; value: string }
  | { kind: "cpf"; value: string }
  | { kind: "phone"; value: string }
  | { kind: "name"; value: string };

/** Dígito verificador do CPF — separa CPF de telefone celular (os dois têm 11 dígitos). */
export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}

const CUID_RE = /^c[a-z0-9]{20,32}$/;

/**
 * "processo 2342" | "proc. 2342" | "card 2342" | "nº 2342" | "#2342" | "2342" → número do card;
 * CPF (com ou sem máscara, dígito válido) → cpf; 10–13 dígitos → telefone;
 * cuid → id; resto → nome. Vazio → null.
 */
export function parseCardRef(input: string): CardRef | null {
  const raw = input.trim();
  if (!raw) return null;
  if (CUID_RE.test(raw)) return { kind: "id", value: raw };

  const numbered = raw.match(/^(?:(?:processo|proc\.?|card|cart[aã]o|n[º°o]\.?|numero|número)\s*)?#?\s*(\d{1,7})$/i);
  if (numbered) return { kind: "cardNumber", value: Number(numbered[1]) };

  if (/^[\d\s.\-()+/]+$/.test(raw)) {
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 11 && isValidCpf(digits)) return { kind: "cpf", value: digits };
    if (digits.length >= 10 && digits.length <= 13) return { kind: "phone", value: digits };
    if (digits.length === 11) return { kind: "cpf", value: digits };
  }
  return { kind: "name", value: raw };
}

/** "Falta Senha – Solicitado" → "FALTA SENHA SOLICITADO". */
export function normalizeColumnName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

export type ColumnMatch = { exact: string } | { exact: null; candidates: string[] };

/**
 * Casa o texto do operador com o nome real de uma coluna.
 * Igual (normalizado) → exact. Senão, colunas que contêm todas as palavras do
 * texto → candidates (uma só candidata ainda volta como candidata: a skill
 * confirma antes de usar numa ação; numa leitura pode seguir).
 */
export function matchColumn(names: string[], query: string): ColumnMatch {
  const q = normalizeColumnName(query);
  if (!q) return { exact: null, candidates: [] };
  const exact = names.find((n) => normalizeColumnName(n) === q);
  if (exact) return { exact };
  const words = q.split(" ");
  const candidates = names.filter((n) => {
    const norm = ` ${normalizeColumnName(n)} `;
    return words.every((w) => norm.includes(` ${w}`));
  });
  return { exact: null, candidates };
}

const DAY_MS = 86_400_000;

/** Dias de calendário em Brasília entre `from` e `to` (mesmo dia = 0). */
export function brDaysBetween(from: Date, to: Date = new Date()): number {
  return Math.round((brStartOfDay(to).getTime() - brStartOfDay(from).getTime()) / DAY_MS);
}

/** "24/10/2026 14:05" em Brasília. */
export function brDateTime(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BR_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date)).replace(",", "");
}

/** "24/10/2026" em Brasília (null-safe sobre `brDateBR`). */
export function brDate(date: Date | string | null | undefined): string | null {
  return date ? brDateBR(date) : null;
}

// Política da operação por IA (puro: sem banco/sessão, testado em
// tests/op-policy.test.ts).
//
// Níveis de autonomia (docs/ai-first/00-diagnostico-etapa-zero.md §6.3):
//   1 leitura · 2 preparar (rascunho) · 3 interno reversível · 4 externo/sensível
//   (só com aprovação digitada no app) · 5 não existe ferramenta.
// A Etapa 1 só libera L1/L2: OP_MAX_LEVEL sobe quando as ferramentas de escrita
// existirem, nunca antes.

import { createHash } from "crypto";
import type { PermissionKey, PermissionMap } from "../permissions";

export type OpLevel = 1 | 2 | 3 | 4;
export const OP_MAX_LEVEL: OpLevel = 2;

export type OpDenyCode = "nivel_bloqueado" | "sem_permissao" | "somente_leitura";

export type CanRunResult = { ok: true } | { ok: false; code: OpDenyCode; message: string };

/**
 * Decide se o operador pode rodar uma ferramenta. A permissão vem do banco
 * (resolvePermissions do User do token), nunca do que o app afirma.
 */
export function canRun(level: OpLevel, permission: PermissionKey, perms: PermissionMap): CanRunResult {
  if (level > OP_MAX_LEVEL) {
    return { ok: false, code: "nivel_bloqueado", message: "Esta ferramenta ainda não está liberada nesta etapa." };
  }
  // "Somente Dashboard" é para quem só acompanha leads de tráfego: sem kanban
  // na tela, sem ficha de cliente pela IA (o op_use padrão do cargo não vale).
  if (!perms.op_use || perms.dashboard_only) {
    return { ok: false, code: "sem_permissao", message: "Você não tem permissão para usar a IA de operação." };
  }
  if (!perms[permission]) {
    return { ok: false, code: "sem_permissao", message: "Você não tem permissão para esta consulta." };
  }
  if (level >= 3) {
    if (perms.read_only) {
      return { ok: false, code: "somente_leitura", message: "Seu acesso é somente de visualização." };
    }
    if (!perms.op_write) {
      return { ok: false, code: "sem_permissao", message: "Você não tem permissão para a IA alterar o CRM." };
    }
  }
  return { ok: true };
}

/** JSON com chaves ordenadas (objetos aninhados também) — base do hash de aprovação. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/**
 * Hash SHA-256 de {tool, args} canônico. Na Etapa 5 a aprovação L4 guarda este
 * hash: argumento alterado depois do "aprovo" = hash diferente = recusa.
 */
export function canonicalHash(tool: string, args: unknown): string {
  return createHash("sha256").update(canonicalJson({ tool, args })).digest("hex");
}

/** CPF em lista: "***.456.789-**". Menos de 11 dígitos → só os 3 do meio que existirem. */
export function maskCpf(cpf: string | null | undefined): string | null {
  if (!cpf) return null;
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return d.length ? "***" : null;
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

/** Telefone em registro de auditoria: só os 4 últimos dígitos. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, "");
  return d.length > 4 ? `***${d.slice(-4)}` : "***";
}

// Campos que NUNCA saem de uma ferramenta, em qualquer profundidade: senha do
// login, senha do INSS do cliente, hashes e credenciais da Meta.
const SENSITIVE_KEYS = new Set([
  "password",
  "senha_inss",
  "tokenHash",
  "codeHash",
  "accessTokenEnc",
  "appSecretEnc",
  "permissions",
]);

/** Cópia profunda sem os campos sensíveis. */
export function stripSensitive<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripSensitive) as T;
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k)) continue;
      out[k] = stripSensitive(v);
    }
    return out as T;
  }
  return value;
}

/**
 * Args para gravar em op_tool_calls: CPF e telefone mascarados (o prompt
 * completo já fica em op_requests; o registro da ferramenta não precisa
 * repetir o documento do cliente).
 */
export function stripSensitiveArgs(args: unknown): unknown {
  const clean = stripSensitive(args);
  if (!clean || typeof clean !== "object" || Array.isArray(clean)) return clean ?? {};
  const out: Record<string, unknown> = { ...(clean as Record<string, unknown>) };
  for (const [k, v] of Object.entries(out)) {
    if (typeof v !== "string") continue;
    if (/cpf/i.test(k)) out[k] = maskCpf(v);
    else if (/telefone|phone/i.test(k)) out[k] = maskPhone(v);
    else if (/^\D*\d{3}\.?\d{3}\.?\d{3}-?\d{2}\D*$/.test(v)) out[k] = maskCpf(v);
    else if (/^[\d\s.\-()+]+$/.test(v) && /^\d{10,13}$/.test(v.replace(/\D/g, ""))) out[k] = maskPhone(v);
  }
  return out;
}

/** Corta texto para caber num campo de resumo (padrão 300 chars). */
export function truncate(text: string, max = 300): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

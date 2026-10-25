// Aprovação L4 da IA de operação (Etapa 5) — regras puras, testadas em
// tests/approval-code.test.ts.
//
// A preparação devolve um código curto; o envio só sai se o OPERADOR digitar
// "aprovo <código>" no Claude Code. O prompt digitado chega ao CRM pelo hook
// UserPromptSubmit (op_requests); o modelo não digita prompt, então chamar
// executar_aprovado sozinho não basta.

import { createHash } from "crypto";

/** Sem 0/O, 1/I/L, 5/S, 2/Z, 8/B: o operador lê e digita sem confundir. */
export const APPROVAL_CODE_ALPHABET = "ACDEFGHJKMNPQRTUVWXY34679";
export const APPROVAL_CODE_LENGTH = 4;
/** Aprovação vale 30 min depois de preparada (plano da Etapa 5). */
export const APPROVAL_TTL_MS = 30 * 60_000;

/** Código curto e estável derivado do id da aprovação (sha256 → alfabeto). */
export function approvalCode(approvalId: string): string {
  const digest = createHash("sha256").update(`op-approval:${approvalId}`).digest();
  let out = "";
  for (let i = 0; i < APPROVAL_CODE_LENGTH; i++) out += APPROVAL_CODE_ALPHABET[digest[i] % APPROVAL_CODE_ALPHABET.length];
  return out;
}

/** Mensagem de aprovação é curta: frase citada no meio de um texto longo não vale. */
export const APPROVAL_PROMPT_MAX_CHARS = 120;

/**
 * O prompt aprova ESTE código? A mensagem inteira tem que ser a aprovação:
 * "aprovo K7QX", "Aprovo k7qx.", "ok, aprovo K7QX pode mandar", "sim aprovo
 * K7QX". Pergunta ("o que acontece se eu digitar aprovo K7QX?"), instrução
 * colada de volta ("peça para digitar: aprovo K7QX"), negação, outro código ou
 * código colado em outra palavra não valem.
 */
export function typedApprovalMatches(text: string, code: string): boolean {
  if (!code || !text || text.length > APPROVAL_PROMPT_MAX_CHARS) return false;
  const plain = text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!c) return false;
  const re = new RegExp(String.raw`^(?:(?:OK|SIM|CERTO)[,.!\s]*)?APROVO\s+${c}[.!\s]*(?:,?\s*(?:PODE\s+)?(?:MANDAR|ENVIAR)[.!\s]*)?$`);
  return re.test(plain);
}

export type ApprovalStatus = "pendente" | "enviando" | "executada" | "falhou" | "expirada" | "cancelada";

export function isApprovalExpired(expiresAt: Date, now: number = Date.now()): boolean {
  return expiresAt.getTime() <= now;
}

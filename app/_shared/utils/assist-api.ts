// Endereço, corpo e leitura das respostas da rota da IA do Copiloto
// (POST /api/whatsapp/assist/<op>). Puro — sem React, sem banco — para o
// tests/assist-api.test.ts e para o cliente importar sem arrastar o servidor.
//
// Por que uma rota (auditoria de 24/09/2026, DUR-4): resumo, sugestão,
// transcrição e ficha por IA eram server actions de 2-4 s (até 30 s com o micro
// travado), e as actions de uma aba saem numa fila SERIAL: enviar, tag e
// anexos esperavam a IA terminar. Por fetch a IA corre em paralelo e a fila
// fica só com as mutações.

import { HttpError, postJson } from './fetch-json';

export const ASSIST_OPS = ['summary', 'suggest', 'transcribe', 'ficha'] as const;
export type AssistOp = (typeof ASSIST_OPS)[number];

/** Ops que devolvem só um texto (`{ text }`). */
export type AssistTextOp = Exclude<AssistOp, 'ficha'>;

export const ASSIST_URL = '/api/whatsapp/assist';

// ids do banco são cuid/uuid (≤ 36): o teto só barra lixo antes da query.
const MAX_ID_LENGTH = 64;

export function isAssistOp(v: unknown): v is AssistOp {
  return typeof v === 'string' && (ASSIST_OPS as readonly string[]).includes(v);
}

export function assistUrl(op: AssistOp): string {
  return `${ASSIST_URL}/${op}`;
}

/** A transcrição é por mensagem; o resto, por contato. */
export function assistIdField(op: AssistOp): 'contactId' | 'messageId' {
  return op === 'transcribe' ? 'messageId' : 'contactId';
}

/** Corpo do POST: só o id (nada de conteúdo; o limite de 4,5 MB da Vercel nem entra em jogo). */
export function assistBody(op: AssistOp, id: string): Record<string, string> {
  return { [assistIdField(op)]: id };
}

/** Lado da rota: o id do corpo, aparado, ou `null` (ausente, vazio, tipo errado, comprido demais). */
export function readAssistTarget(op: AssistOp, body: unknown): string | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const raw = (body as Record<string, unknown>)[assistIdField(op)];
  if (typeof raw !== 'string') return null;
  const id = raw.trim();
  return id && id.length <= MAX_ID_LENGTH ? id : null;
}

/** `{ text }` de resumo, sugestão e transcrição. Formato errado (proxy, deploy no meio) LANÇA. */
export function readAssistText(body: unknown): string {
  const text = body && typeof body === 'object' ? (body as { text?: unknown }).text : undefined;
  if (typeof text !== 'string' || !text.trim()) throw new Error('Resposta inválida da IA. Tente de novo.');
  return text;
}

/** Resultado do "Preencher com IA" (mesmo formato do `FichaAiResult` de ficha-ai.ts). */
export interface AssistFichaResponse {
  filled: string[];
  hospitalHint?: string | null;
  reason?: string;
}

export function readFichaResult(body: unknown): AssistFichaResponse {
  const b = body && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  if (!b || !Array.isArray(b.filled)) throw new Error('Resposta inválida da IA. Tente de novo.');
  return {
    filled: b.filled.filter((f): f is string => typeof f === 'string'),
    hospitalHint: typeof b.hospitalHint === 'string' && b.hospitalHint.trim() ? b.hospitalHint : null,
    reason: typeof b.reason === 'string' ? b.reason : undefined,
  };
}

/** POST do resumo/sugestão/transcrição → o texto. Lança `HttpError` (com a mensagem da rota) ou erro de formato. */
export async function requestAssistText(op: AssistTextOp, id: string): Promise<string> {
  return readAssistText(await postJson<unknown>(assistUrl(op), assistBody(op, id)));
}

/** POST do "Preencher com IA" da ficha. */
export async function requestFichaAI(contactId: string): Promise<AssistFichaResponse> {
  return readFichaResult(await postJson<unknown>(assistUrl('ficha'), assistBody('ficha', contactId)));
}

/**
 * Texto para o atendente: a mensagem da rota ("A IA demorou demais…",
 * "Serviço de IA fora do ar…", "Acesso restrito à equipe."); 401 = sessão
 * vencida; 404 sem mensagem = a rota não existe nesta versão (aba com o
 * bundle de antes do deploy); 5xx sem mensagem = a função caiu ou estourou
 * o tempo; falha de rede = sem conexão; o resto, o `fallback` da ação.
 */
export function describeAssistError(err: unknown, fallback: string): string {
  const base = fallback.replace(/[.\s]+$/, '');
  if (err instanceof HttpError) {
    if (err.status === 401) return 'Sua sessão expirou. Recarregue a página (F5) e entre de novo.';
    if (err.serverError) return err.serverError;
    if (err.status === 404) return `${base}. Recarregue a página (F5) e tente de novo.`;
    if (err.status >= 500) return `A IA não respondeu (erro ${err.status}). Tente de novo em instantes.`;
    return `${base} (erro ${err.status}).`;
  }
  if (err instanceof TypeError) return 'Sem conexão com o servidor. Confira a internet.';
  // SyntaxError = corpo 2xx que não era JSON (proxy): o texto cru não ajuda ninguém.
  if (err instanceof Error && err.message && !(err instanceof SyntaxError)) return err.message;
  return `${base}.`;
}

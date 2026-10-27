// Registro da operação por IA (op_sessions / op_requests / op_tool_calls).
// É a auditoria de "quem pediu o quê e o que a IA fez" e o dado do dashboard —
// falha de registro nunca derruba a ferramenta. Desde 27/10 (item A) a rota
// grava a chamada em runAfterResponse: o registro sai do caminho crítico.

import { Prisma } from "@prisma/client";
import { db } from "../prisma";
import { stripSensitive, truncate } from "./policy";

/** Prompts mais antigos que isso não são ligados a uma ferramenta nova. */
const REQUEST_LINK_WINDOW_MS = 30 * 60_000;
/** `lastSeenAt` da sessão é regravado no máximo a cada 5 min (era 1 UPDATE por ferramenta). */
const SESSION_TOUCH_MS = 5 * 60_000;
const MAX_PROMPT_CHARS = 20_000;

/** Acha/cria a sessão do app. Id de sessão de outro operador → null (não mistura auditoria). */
export async function ensureOpSession(
  operatorId: string,
  clientSessionId: string | null | undefined,
  cwd?: string | null,
): Promise<string | null> {
  const key = clientSessionId?.trim().slice(0, 200);
  if (!key) return null;
  try {
    const now = new Date();
    const existing = await db.opSession.findUnique({ where: { clientSessionId: key }, select: { id: true, operatorId: true, lastSeenAt: true } });
    if (existing) {
      if (existing.operatorId !== operatorId) return null;
      // lastSeenAt só alimenta "última atividade" do painel: regravar a cada
      // ferramenta era 1 UPDATE por chamada no caminho crítico (27/10).
      const seen = existing.lastSeenAt?.getTime() ?? 0;
      if (now.getTime() - seen > SESSION_TOUCH_MS) {
        await db.opSession.update({ where: { id: existing.id }, data: { lastSeenAt: now } });
      }
      return existing.id;
    }
    const created = await db.opSession.create({
      data: { operatorId, clientSessionId: key, cwd: cwd?.slice(0, 500) ?? null, startedAt: now, lastSeenAt: now },
      select: { id: true },
    });
    return created.id;
  } catch (err) {
    // Corrida de duas chamadas criando a mesma sessão: a outra venceu.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const row = await db.opSession.findUnique({ where: { clientSessionId: key }, select: { id: true, operatorId: true } });
      return row && row.operatorId === operatorId ? row.id : null;
    }
    console.error("[op] falha ao registrar sessão:", err);
    return null;
  }
}

/** "/cliente 123..." → "cliente". */
export function skillFromPrompt(text: string): string | null {
  const m = text.trim().match(/^\/([a-z][\w-]{1,40})\b/i);
  return m ? m[1].toLowerCase() : null;
}

export async function recordPrompt(input: { sessionId: string; operatorId: string; text: string; clientKey?: string | null }): Promise<string | null> {
  try {
    const row = await db.opRequest.create({
      data: {
        sessionId: input.sessionId,
        operatorId: input.operatorId,
        text: input.text.slice(0, MAX_PROMPT_CHARS),
        skill: skillFromPrompt(input.text),
        clientKey: input.clientKey?.slice(0, 80) ?? null,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    // Chave repetida (hook reenviou o mesmo evento): devolve a linha que já existe.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" && input.clientKey) {
      const row = await db.opRequest.findUnique({ where: { clientKey: input.clientKey.slice(0, 80) }, select: { id: true, sessionId: true, operatorId: true } });
      return row && row.sessionId === input.sessionId && row.operatorId === input.operatorId ? row.id : null;
    }
    console.error("[op] falha ao registrar prompt:", err);
    return null;
  }
}

/** Resposta guardada por prompt (27/10): o fim é o que importa (o resumo final do app). */
export const MAX_RESPONSE_CHARS = 8_000;

/**
 * Resposta do app ao prompt (hook Stop op-response.mjs). Liga pela chave do
 * hook, conferindo sessão e operador. O POST do prompt sai desacoplado no
 * começo do turno: numa resposta muito rápida ele pode ainda não ter chegado,
 * por isso uma segunda tentativa curta. Devolve false se não achou o prompt.
 */
export async function recordResponse(input: { sessionId: string; operatorId: string; clientKey: string; text: string }): Promise<boolean> {
  const text = input.text.trim();
  if (!text) return false;
  const response = text.length > MAX_RESPONSE_CHARS ? `…${text.slice(-MAX_RESPONSE_CHARS)}` : text;
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const res = await db.opRequest.updateMany({
      where: { clientKey: input.clientKey.slice(0, 80), sessionId: input.sessionId, operatorId: input.operatorId },
      data: { response, respondedAt: new Date() },
    });
    if (res.count) return true;
    if (tentativa === 0) await new Promise((r) => setTimeout(r, 2500));
  }
  return false;
}

/**
 * Pedido pela chave que o hook gerou (X-Op-Request): um findUnique no índice,
 * e liga ao prompt EXATO mesmo quando o operador mandou dois em seguida. Só
 * vale se o prompt for desta sessão e deste operador (não mistura auditoria).
 */
export async function requestIdByClientKey(clientKey: string | null | undefined, sessionId: string, operatorId: string): Promise<string | null> {
  const key = clientKey?.trim().slice(0, 80);
  if (!key) return null;
  try {
    const row = await db.opRequest.findUnique({ where: { clientKey: key }, select: { id: true, sessionId: true, operatorId: true } });
    return row && row.sessionId === sessionId && row.operatorId === operatorId ? row.id : null;
  } catch (err) {
    console.error("[op] falha ao achar o prompt pela chave:", err);
    return null;
  }
}

/** Último prompt da sessão (até 30 min) — o pedido que levou à ferramenta. */
export async function latestRequestId(sessionId: string): Promise<string | null> {
  const row = await db.opRequest.findFirst({
    where: { sessionId, createdAt: { gte: new Date(Date.now() - REQUEST_LINK_WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return row?.id ?? null;
}

export interface ToolCallRecord {
  sessionId: string | null;
  /** Já resolvido pela rota (L3 grava no metadata.op do Log); omitido = busca aqui. */
  requestId?: string | null;
  operatorId: string;
  tool: string;
  level: number;
  args: unknown;
  ok: boolean;
  code?: string | null;
  summary: string;
  cardIds?: string[];
  durationMs: number;
  /** Item G (27/10): hash da prévia (emitida ou recebida) e avisos do resultado, para o painel de "ignorados". */
  previaHash?: string | null;
  avisos?: string[];
}

export async function recordToolCall(input: ToolCallRecord): Promise<void> {
  try {
    const requestId =
      input.requestId !== undefined ? input.requestId : input.sessionId ? await latestRequestId(input.sessionId) : null;
    await db.opToolCall.create({
      data: {
        sessionId: input.sessionId,
        requestId,
        operatorId: input.operatorId,
        tool: input.tool.slice(0, 100),
        level: input.level,
        args: (stripSensitive(input.args) ?? {}) as Prisma.InputJsonValue,
        ok: input.ok,
        code: input.code ?? null,
        summary: truncate(input.summary),
        cardIds: (input.cardIds ?? []).slice(0, 100),
        durationMs: Math.max(0, Math.round(input.durationMs)),
        previaHash: input.previaHash?.slice(0, 64) ?? null,
        avisos: (input.avisos ?? []).map((a) => a.slice(0, 40)).slice(0, 20),
      },
    });
  } catch (err) {
    console.error("[op] falha ao registrar ferramenta:", err);
  }
}

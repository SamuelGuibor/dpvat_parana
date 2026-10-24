// Registro da operação por IA (op_sessions / op_requests / op_tool_calls).
// Gravado com await: é a auditoria de "quem pediu o quê e o que a IA fez" e o
// dado do dashboard — mas falha de registro nunca derruba a ferramenta.

import { Prisma } from "@prisma/client";
import { db } from "../prisma";
import { stripSensitive, truncate } from "./policy";

/** Prompts mais antigos que isso não são ligados a uma ferramenta nova. */
const REQUEST_LINK_WINDOW_MS = 30 * 60_000;
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
    const existing = await db.opSession.findUnique({ where: { clientSessionId: key }, select: { id: true, operatorId: true } });
    if (existing) {
      if (existing.operatorId !== operatorId) return null;
      await db.opSession.update({ where: { id: existing.id }, data: { lastSeenAt: now } });
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

export async function recordPrompt(input: { sessionId: string; operatorId: string; text: string }): Promise<string | null> {
  try {
    const row = await db.opRequest.create({
      data: {
        sessionId: input.sessionId,
        operatorId: input.operatorId,
        text: input.text.slice(0, MAX_PROMPT_CHARS),
        skill: skillFromPrompt(input.text),
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    console.error("[op] falha ao registrar prompt:", err);
    return null;
  }
}

/** Último prompt da sessão (até 30 min) — o pedido que levou à ferramenta. */
async function latestRequestId(sessionId: string): Promise<string | null> {
  const row = await db.opRequest.findFirst({
    where: { sessionId, createdAt: { gte: new Date(Date.now() - REQUEST_LINK_WINDOW_MS) } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return row?.id ?? null;
}

export interface ToolCallRecord {
  sessionId: string | null;
  operatorId: string;
  tool: string;
  level: number;
  args: unknown;
  ok: boolean;
  code?: string | null;
  summary: string;
  cardIds?: string[];
  durationMs: number;
}

export async function recordToolCall(input: ToolCallRecord): Promise<void> {
  try {
    const requestId = input.sessionId ? await latestRequestId(input.sessionId) : null;
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
      },
    });
  } catch (err) {
    console.error("[op] falha ao registrar ferramenta:", err);
  }
}

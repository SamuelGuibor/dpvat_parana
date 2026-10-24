// Respostas padronizadas da API de operação: {ok:true, data} ou
// {ok:false, code, message}. O MCP repassa a `message` ao modelo em português.

import type { NextResponse } from "next/server";
import { noStoreJson } from "../route-auth";
import { reportCriticalError } from "../report-error";
import { OpAuthError, resolveOperator, type OperatorContext } from "./auth";

export type OpFailure = { ok: false; code: string; message: string; details?: unknown };

export function opFail(status: number, code: string, message: string, details?: unknown): NextResponse<OpFailure> {
  return noStoreJson({ ok: false as const, code, message, ...(details !== undefined ? { details } : {}) }, { status });
}

/** resolveOperator para route handler: falha vira resposta pronta (401/403/429/500). */
export async function opAuth(req: Request, context: string): Promise<{ op: OperatorContext } | { res: NextResponse }> {
  try {
    return { op: await resolveOperator(req) };
  } catch (err) {
    if (err instanceof OpAuthError) return { res: opFail(err.status, err.code, err.message) };
    await reportCriticalError(context, err);
    return { res: opFail(500, "erro_interno", "Falha ao conferir o token. Tente de novo.") };
  }
}

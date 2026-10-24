// POST /api/op/tools/<nome> — executa uma ferramenta da IA de operação.
// Token → operador (permissões do banco) → ferramenta → nível/permissão →
// args (zod) → execução → op_tool_calls (com await) → {ok, data}.
// Nunca lança: erro esperado vira {ok:false, code, message}; inesperado vira
// reportCriticalError + 500 genérico.

import { noStoreJson } from "@/app/_shared/lib/route-auth";
import { opAuth, opFail } from "@/app/_shared/lib/op/http";
import { describeZodError, OpToolError } from "@/app/_shared/lib/op/registry";
import { canRun } from "@/app/_shared/lib/op/policy";
import { ensureOpSession, recordToolCall } from "@/app/_shared/lib/op/record";
import { getTool } from "@/app/_shared/lib/op/tools";
import { reportCriticalError } from "@/app/_shared/lib/report-error";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: { tool: string } };

export async function POST(req: Request, { params }: Ctx) {
  const started = Date.now();
  const auth = await opAuth(req, "op_tool_auth");
  if ("res" in auth) return auth.res;
  const { op } = auth;

  const tool = getTool(params.tool);
  if (!tool) return opFail(404, "ferramenta_desconhecida", `Ferramenta "${params.tool}" não existe.`);

  const body = (await req.json().catch(() => null)) as { args?: unknown } | null;
  const rawArgs = body?.args ?? {};
  const sessionId = await ensureOpSession(op.userId, req.headers.get("x-op-session"), req.headers.get("x-op-cwd"));
  const record = (r: { ok: boolean; code?: string; summary: string; cardIds?: string[] }) =>
    recordToolCall({
      sessionId,
      operatorId: op.userId,
      tool: tool.name,
      level: tool.level,
      args: rawArgs,
      durationMs: Date.now() - started,
      ...r,
    });

  const allowed = canRun(tool.level, tool.permission, op.permissions);
  if (!allowed.ok) {
    await record({ ok: false, code: allowed.code, summary: allowed.message });
    return opFail(403, allowed.code, allowed.message);
  }

  const parsed = tool.schema.safeParse(rawArgs);
  if (!parsed.success) {
    const message = describeZodError(parsed.error);
    await record({ ok: false, code: "argumentos_invalidos", summary: message });
    return opFail(400, "argumentos_invalidos", message);
  }

  try {
    const result = await tool.run({ op }, parsed.data);
    await record({ ok: true, summary: result.summary, cardIds: result.cardIds });
    return noStoreJson({ ok: true, data: result.data });
  } catch (err) {
    if (err instanceof OpToolError) {
      await record({ ok: false, code: err.code, summary: err.message });
      return opFail(err.status, err.code, err.message, err.details);
    }
    await reportCriticalError(`op_tool:${tool.name}`, err, { metadata: { operatorId: op.userId } });
    await record({ ok: false, code: "erro_interno", summary: "erro inesperado" });
    return opFail(500, "erro_interno", "Falha ao consultar o CRM. Tente de novo.");
  }
}

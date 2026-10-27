// POST /api/op/tools/<nome> — executa uma ferramenta da IA de operação.
// Token → operador (permissões do banco) → ferramenta → interruptor (L3/L4/registro) →
// nível/permissão → args (zod) → execução → {ok, data}; op_tool_calls é gravado
// em runAfterResponse (item A, 27/10: o registro saiu do caminho crítico — eram
// 60–150 ms por chamada). O pedido de origem vem do header X-Op-Request (chave
// que o hook gerou; op_requests.clientKey); sem header, cai no último prompt da
// sessão. Cada linha guarda previaHash + avisos (item G) via op-registro.ts.
// L3 direta grava UMA linha (confirmar: true executa); L3 que exige confirmação
// grava duas (requer_confirmacao e execução com `previa_hash`) —
// app/_shared/lib/op/preview.ts.
// Nunca lança: erro esperado vira {ok:false, code, message}; inesperado vira
// reportCriticalError + 500 genérico.

import { noStoreJson } from "@/app/_shared/lib/route-auth";
import { opAuth, opFail } from "@/app/_shared/lib/op/http";
import { describeZodError, OpToolError } from "@/app/_shared/lib/op/registry";
import { canRun } from "@/app/_shared/lib/op/policy";
import { ensureOpSession, latestRequestId, recordToolCall, requestIdByClientKey } from "@/app/_shared/lib/op/record";
import { registroDaChamada } from "@/app/_shared/utils/op-registro";
import { runAfterResponse } from "@/app/_shared/lib/background";
import { getOpSwitches, hasSwitch, isToolEnabled } from "@/app/_shared/lib/op/switches";
import { CardWriteError } from "@/app/_shared/lib/cards/types";
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
  const requestKey = req.headers.get("x-op-request");
  // Chave do header primeiro; se o evento do prompt ainda não chegou (POST
  // desacoplado), cai no último prompt da sessão para não perder a ligação.
  const requestId = sessionId
    ? ((requestKey ? await requestIdByClientKey(requestKey, sessionId, op.userId) : null) ?? (await latestRequestId(sessionId)))
    : null;
  // O hash da prévia não é argumento da ação: fica fora do registro.
  const recordedArgs =
    rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
      ? Object.fromEntries(Object.entries(rawArgs as Record<string, unknown>).filter(([k]) => k !== "previa_hash"))
      : rawArgs;
  // Registro fora do caminho crítico: a resposta sai antes do INSERT. Falha
  // de registro nunca derruba a ferramenta (recordToolCall só loga).
  const record = (r: { ok: boolean; code?: string; summary: string; cardIds?: string[]; data?: unknown }) => {
    const durationMs = Date.now() - started;
    const { data, ...rest } = r;
    const registro = registroDaChamada({ args: rawArgs, data, code: r.code });
    runAfterResponse("op_tool_record", () =>
      recordToolCall({
        sessionId,
        requestId,
        operatorId: op.userId,
        tool: tool.name,
        level: tool.level,
        args: recordedArgs,
        durationMs,
        previaHash: registro.previaHash,
        avisos: registro.avisos,
        ...rest,
      }),
    );
  };

  const enabled = !hasSwitch(tool) || isToolEnabled(await getOpSwitches(), tool);
  const allowed = canRun(tool.level, tool.permission, op.permissions, enabled);
  if (!allowed.ok) {
    record({ ok: false, code: allowed.code, summary: allowed.message });
    return opFail(403, allowed.code, allowed.message);
  }

  const parsed = tool.schema.safeParse(rawArgs);
  if (!parsed.success) {
    const message = describeZodError(parsed.error);
    record({ ok: false, code: "argumentos_invalidos", summary: message });
    return opFail(400, "argumentos_invalidos", message);
  }

  try {
    const result = await tool.run({ op, trace: { sessionId, requestId } }, parsed.data);
    record({ ok: true, summary: result.summary, cardIds: result.cardIds, data: result.data });
    return noStoreJson({ ok: true, data: result.data });
  } catch (err) {
    if (err instanceof OpToolError) {
      record({ ok: false, code: err.code, summary: err.message, data: err.details });
      return opFail(err.status, err.code, err.message, err.details);
    }
    if (err instanceof CardWriteError) {
      record({ ok: false, code: err.code, summary: err.message });
      return opFail(err.code === "destinatario_invalido" || err.code === "texto_vazio" ? 422 : 404, err.code, err.message);
    }
    await reportCriticalError(`op_tool:${tool.name}`, err, { metadata: { operatorId: op.userId } });
    record({ ok: false, code: "erro_interno", summary: "erro inesperado" });
    return opFail(500, "erro_interno", "Falha ao consultar o CRM. Tente de novo.");
  }
}

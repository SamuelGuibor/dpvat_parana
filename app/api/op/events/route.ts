// POST /api/op/events — eventos dos hooks do Claude Code (.claude/hooks/op-*.mjs):
//   prompt        → op_requests (texto completo — decisão 7)
//   session_start → só abre/atualiza op_sessions
//   tool_error    → op_tool_calls com ok=false (falha que o CRM não viu: MCP
//                   fora do ar, recusa no app, timeout)
//   response      → op_requests.response do prompt da requestKey (27/10, hook
//                   Stop op-response.mjs; o chat aparece inteiro na tela)
// O hook nunca bloqueia o app: qualquer resposta aqui é só registro.

import { z } from "zod/v4";
import { noStoreJson } from "@/app/_shared/lib/route-auth";
import { opAuth, opFail } from "@/app/_shared/lib/op/http";
import { ensureOpSession, recordPrompt, recordResponse, recordToolCall } from "@/app/_shared/lib/op/record";
import { getTool } from "@/app/_shared/lib/op/tools";
import { describeZodError } from "@/app/_shared/lib/op/registry";
import { purgeDevPrompts } from "@/app/_shared/lib/op/retencao";
import { runAfterResponse } from "@/app/_shared/lib/background";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  type: z.enum(["prompt", "session_start", "tool_error", "response"]),
  clientSessionId: z.string().min(1).max(200),
  cwd: z.string().max(500).optional(),
  // Item A (27/10): chave do prompt gerada pelo hook; o MCP manda a mesma em X-Op-Request.
  requestKey: z.string().min(8).max(80).optional(),
  text: z.string().max(100_000).optional(),
  tool: z.string().max(200).optional(),
  message: z.string().max(1000).optional(),
});

export async function POST(req: Request) {
  const auth = await opAuth(req, "op_events_auth");
  if ("res" in auth) return auth.res;
  const { op } = auth;
  if (!op.permissions.op_use) return opFail(403, "sem_permissao", "Você não tem permissão para usar a IA de operação.");

  const parsed = eventSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return opFail(400, "argumentos_invalidos", describeZodError(parsed.error));
  const ev = parsed.data;

  const sessionId = await ensureOpSession(op.userId, ev.clientSessionId, ev.cwd);
  if (!sessionId) return opFail(409, "sessao_invalida", "Sessão do app não pôde ser registrada.");

  if (ev.type === "prompt") {
    if (!ev.text?.trim()) return noStoreJson({ ok: true, data: { ignorado: true } });
    const requestId = await recordPrompt({ sessionId, operatorId: op.userId, text: ev.text, clientKey: ev.requestKey });
    // Decisão 19 (26/10): prompt de desenvolvimento do operador some depois de
    // 1 h. Roda aqui, a cada prompt dele (só as últimas 24 h, barato), e o
    // cron diário de retenção pega o resto.
    runAfterResponse("op_purge_dev_prompts", () =>
      purgeDevPrompts({ operatorId: op.userId, desde: new Date(Date.now() - 24 * 3_600_000), limit: 200 }),
    );
    return noStoreJson({ ok: true, data: { requestId } });
  }

  if (ev.type === "response") {
    if (!ev.requestKey || !ev.text?.trim()) return noStoreJson({ ok: true, data: { ignorado: true } });
    const gravado = await recordResponse({ sessionId, operatorId: op.userId, clientKey: ev.requestKey, text: ev.text });
    return noStoreJson({ ok: true, data: { gravado } });
  }

  if (ev.type === "tool_error") {
    // "mcp__crm-op__obter_card" → "obter_card"
    const name = (ev.tool ?? "desconhecida").replace(/^mcp__[^_]+(?:-[^_]+)*__/, "");
    await recordToolCall({
      sessionId,
      operatorId: op.userId,
      tool: name,
      level: getTool(name)?.level ?? 0,
      args: {},
      ok: false,
      code: "erro_no_app",
      summary: ev.message ?? "falha registrada pelo app",
      durationMs: 0,
    });
  }
  return noStoreJson({ ok: true, data: { sessionId } });
}

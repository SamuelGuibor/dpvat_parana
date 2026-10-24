// PostToolUse (mcp__crm-op__*): o sucesso e as recusas que passam pela API já
// foram gravados pela rota em op_tool_calls. Aqui só entra o que o CRM não
// viu: falha de transporte do MCP (sem conexão, timeout, token ausente).
// Nunca bloqueia; sai 0 sempre.
import { readFileSync } from "node:fs";

// Códigos que o próprio MCP gera sem falar com o CRM (tools/crm-mcp/index.mjs).
const LOCAL_FAILURE_RE = /\[(sem_conexao|timeout|http_\d+)\]|CRM_OP_TOKEN não configurado/;

async function main() {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const token = process.env.CRM_OP_TOKEN;
  const sessionId = String(input.session_id ?? "");
  if (!token || !sessionId) return;

  const raw = JSON.stringify(input.tool_response ?? "");
  const m = raw.match(LOCAL_FAILURE_RE);
  if (!m) return;

  const base = (process.env.CRM_OP_URL || "https://segurosparana.com.br").replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch(`${base}/api/op/events`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "tool_error",
        clientSessionId: sessionId,
        tool: String(input.tool_name ?? ""),
        message: m[0].slice(0, 200),
      }),
    });
  } finally {
    clearTimeout(timer);
  }
}

main().catch(() => {}).finally(() => process.exit(0));

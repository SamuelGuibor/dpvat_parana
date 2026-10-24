// UserPromptSubmit: registra o prompt do operador em op_requests (POST
// /api/op/events) e grava a sessão atual em ~/.claude/crm-op/session.json
// para o MCP (tools/crm-mcp) ligar as ferramentas a este prompt.
//
// NUNCA bloqueia nem atrasa o app além de 5 s: sem CRM_OP_TOKEN não faz nada,
// e qualquer falha sai com 0 em silêncio. Não escreve nada no stdout (o
// stdout deste hook vira contexto da conversa).
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

async function main() {
  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const sessionId = String(input.session_id ?? "");
  if (!sessionId) return;

  try {
    const dir = join(homedir(), ".claude", "crm-op");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "session.json"), JSON.stringify({ sessionId, at: Date.now() }));
  } catch {
    // sem permissão de escrita no perfil: o MCP usa o id do próprio processo
  }

  const token = process.env.CRM_OP_TOKEN;
  if (!token) return;
  const base = (process.env.CRM_OP_URL || "https://segurosparana.com.br").replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch(`${base}/api/op/events`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "prompt",
        clientSessionId: sessionId,
        cwd: String(input.cwd ?? "").slice(0, 500),
        text: String(input.prompt ?? ""),
      }),
    });
  } finally {
    clearTimeout(timer);
  }
}

main().catch(() => {}).finally(() => process.exit(0));

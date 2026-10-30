// UserPromptSubmit: registra o prompt do operador em op_requests (POST
// /api/op/events) e grava a sessão atual em ~/.claude/crm-op/session.json
// para o MCP (tools/crm-mcp) ligar as ferramentas a este prompt.
//
// NUNCA bloqueia nem atrasa o app: sem CRM_OP_TOKEN não faz nada, e qualquer
// falha sai com 0 em silêncio. Não escreve nada no stdout (o stdout deste hook
// vira contexto da conversa).
//
// Decisão do dono (27/10): o hook não segura o prompt esperando a Vercel. O
// POST sai num processo filho desacoplado (o hook devolve em < 50 ms). A única
// exceção é a mensagem de aprovação ("aprovo <código>", em qualquer das formas
// que typedApprovalMatches aceita — curta e com a palavra "aprovo"): ela é a
// PROVA do envio L4 e precisa estar gravada antes de o modelo chamar
// executar_aprovado, então continua síncrona (≤ 5 s). Se o POST desacoplado
// se perder, o prompt não entra em op_requests (como já era quando o hook
// falhava): nada sai por isso, mas a auditoria fica sem aquele prompt.
//
// Item A (27/10): o id do pedido nasce AQUI (requestKey, uuid) e vai no
// session.json; o MCP manda no header X-Op-Request e o servidor liga a
// ferramenta ao prompt por essa chave (op_requests.clientKey) — sem esperar a
// resposta do evento e sem a busca "último prompt da sessão" por chamada.
import { readdirSync, readFileSync, mkdirSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Pelo plugin do operador (tools/operacao-plugin, 30/10) o token vem do
// userConfig do plugin (cofre do sistema), exportado como CLAUDE_PLUGIN_OPTION_*;
// neste repositório, da variável de ambiente.
const OP_TOKEN = process.env.CRM_OP_TOKEN || process.env.CLAUDE_PLUGIN_OPTION_CRM_OP_TOKEN || "";
const OP_URL = process.env.CRM_OP_URL || process.env.CLAUDE_PLUGIN_OPTION_CRM_OP_URL || "";

const DIR = join(homedir(), ".claude", "crm-op");
// Mensagem curta com "aprovo": superconjunto do que typedApprovalMatches aceita.
const APROVO_RE = /\baprovo\b/i;
const APROVO_MAX_CHARS = 200;
// Evento que o filho não conseguiu mandar (processo morto) é apagado na próxima
// rodada: o arquivo guarda o texto do prompt, que pode ter dado pessoal.
const EVT_MAX_AGE_MS = 60 * 60_000;

async function post(body) {
  const token = OP_TOKEN;
  if (!token) return;
  const base = (OP_URL || "https://segurosparana.com.br").replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch(`${base}/api/op/events`, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Modo filho: `node op-prompt.mjs --send <arquivo>` lê o evento, manda e apaga o arquivo. */
async function sendFromFile(file) {
  try {
    await post(JSON.parse(readFileSync(file, "utf8")));
  } finally {
    try {
      unlinkSync(file);
    } catch {
      // já apagado
    }
  }
}

function purgeStaleEvents() {
  try {
    const now = Date.now();
    for (const name of readdirSync(DIR)) {
      const evt = name.startsWith("evt-") && name.endsWith(".json");
      const req = name.startsWith("req-") && name.endsWith(".json");
      if (!evt && !req) continue;
      const file = join(DIR, name);
      // req-* só guarda a chave do último prompt da sessão: some depois de 1 dia.
      if (now - statSync(file).mtimeMs > (evt ? EVT_MAX_AGE_MS : 24 * 3_600_000)) unlinkSync(file);
    }
  } catch {
    // sem pasta ou sem permissão: nada a limpar
  }
}

async function main() {
  const i = process.argv.indexOf("--send");
  if (i > 0 && process.argv[i + 1]) return sendFromFile(process.argv[i + 1]);

  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const sessionId = String(input.session_id ?? "");
  if (!sessionId) return;
  const requestKey = randomUUID();

  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(join(DIR, "session.json"), JSON.stringify({ sessionId, requestKey, at: Date.now() }));
    // 27/10: chave do prompt POR sessão, para o op-response.mjs (hook Stop)
    // ligar a resposta ao prompt certo mesmo com dois Claude Code abertos.
    writeFileSync(join(DIR, `req-${sessionId.replace(/[^\w-]/g, "")}.json`), JSON.stringify({ requestKey, at: Date.now() }));
  } catch {
    // sem permissão de escrita no perfil: o MCP usa o id do próprio processo
  }

  if (!OP_TOKEN) return;
  const body = {
    type: "prompt",
    clientSessionId: sessionId,
    requestKey,
    cwd: String(input.cwd ?? "").slice(0, 500),
    text: String(input.prompt ?? ""),
  };
  if (body.text.length <= APROVO_MAX_CHARS && APROVO_RE.test(body.text)) {
    await post(body);
    return;
  }
  purgeStaleEvents();
  // Fila local + filho desacoplado: o hook devolve na hora e o POST segue sozinho.
  // O token NÃO vai para o arquivo (o filho herda o ambiente); só o evento.
  const file = join(DIR, `evt-${Date.now()}-${process.pid}.json`);
  try {
    writeFileSync(file, JSON.stringify(body));
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--send", file], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
  } catch {
    // Sem como desacoplar: manda síncrono como antes.
    await post(body);
  }
}

main().catch(() => {}).finally(() => process.exit(0));

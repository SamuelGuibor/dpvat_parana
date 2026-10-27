// Stop: manda ao CRM a resposta do app ao último prompt do operador (27/10),
// para o chat aparecer inteiro no Espaço de Trabalho → IA de operação
// (pedido → ações → resposta). Liga ao prompt pela requestKey que o
// op-prompt.mjs gravou em ~/.claude/crm-op/req-<sessão>.json.
//
// Mesmas garantias do op-prompt.mjs: sem CRM_OP_TOKEN não faz nada, nunca
// bloqueia nem atrasa o app (POST num processo filho desacoplado), qualquer
// falha sai com 0 em silêncio e nada vai para o stdout. O servidor guarda só
// os últimos 8.000 caracteres e a resposta some junto com o prompt na limpeza.
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(homedir(), ".claude", "crm-op");
// O servidor corta em 8.000; aqui só evita mandar um transcript gigante.
const MAX_CHARS = 20_000;
// Prompt mais velho que isso não é deste turno (hook disparado sem prompt nosso).
const KEY_MAX_AGE_MS = 6 * 3_600_000;

async function post(body) {
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
      body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(timer);
  }
}

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

/** Mensagem do usuário que abriu o turno (não um tool_result devolvido ao modelo). */
function isUserPrompt(entry) {
  if (entry?.type !== "user" || entry.isMeta) return false;
  const content = entry.message?.content;
  if (typeof content === "string") return true;
  return Array.isArray(content) && content.some((b) => b?.type === "text");
}

/** Texto que o app escreveu desde o último prompt do usuário, em ordem. */
export function lastTurnText(jsonl) {
  const entries = [];
  for (const line of jsonl.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // linha parcial (o arquivo ainda está sendo escrito)
    }
  }
  let start = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isUserPrompt(entries[i])) {
      start = i + 1;
      break;
    }
  }
  const parts = [];
  for (const e of entries.slice(start)) {
    if (e?.type !== "assistant") continue;
    const content = e.message?.content;
    if (typeof content === "string") parts.push(content);
    else if (Array.isArray(content)) for (const b of content) if (b?.type === "text" && b.text?.trim()) parts.push(b.text);
  }
  return parts.join("\n\n").trim();
}

async function main() {
  const i = process.argv.indexOf("--send");
  if (i > 0 && process.argv[i + 1]) return sendFromFile(process.argv[i + 1]);
  if (!process.env.CRM_OP_TOKEN) return;

  const input = JSON.parse(readFileSync(0, "utf8") || "{}");
  const sessionId = String(input.session_id ?? "");
  if (!sessionId) return;

  let requestKey;
  try {
    const saved = JSON.parse(readFileSync(join(DIR, `req-${sessionId.replace(/[^\w-]/g, "")}.json`), "utf8"));
    if (Date.now() - Number(saved.at) > KEY_MAX_AGE_MS) return;
    requestKey = String(saved.requestKey);
  } catch {
    return; // prompt não registrado: não há a que ligar a resposta
  }

  let text = typeof input.last_assistant_message === "string" ? input.last_assistant_message : "";
  if (input.transcript_path) {
    try {
      text = lastTurnText(readFileSync(String(input.transcript_path), "utf8")) || text;
    } catch {
      // sem transcript: fica com o last_assistant_message, se veio
    }
  }
  text = text.trim();
  if (!text) return;
  if (text.length > MAX_CHARS) text = `…${text.slice(-MAX_CHARS)}`;

  const body = { type: "response", clientSessionId: sessionId, requestKey, text };
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
    await post(body);
  }
}

// Importado pelos testes: só roda como hook. resolve() + minúsculas porque no
// Windows o $CLAUDE_PROJECT_DIR chega com "/" e a letra do drive varia.
const self = resolve(fileURLToPath(import.meta.url)).toLowerCase();
if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === self) {
  main().catch(() => {}).finally(() => process.exit(0));
}

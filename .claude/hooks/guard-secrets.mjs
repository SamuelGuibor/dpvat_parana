// PreToolUse (Read|Grep): o .env deste repo aponta para PRODUÇÃO (Neon, AWS,
// Meta, Anthropic). A IA não lê o arquivo — nem para "conferir uma variável".
// .env.example (só nomes) continua legível. A versão para Bash/PowerShell
// está em guard-bash.mjs.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const ti = input?.tool_input ?? {};
const isSecretFile = (p) => {
  const name = basename(String(p ?? "").replace(/\\/g, "/"));
  return /^\.env(\..+)?$/.test(name) && name !== ".env.example";
};

let hit = null;
if (input.tool_name === "Read" && isSecretFile(ti.file_path)) hit = ti.file_path;
if (input.tool_name === "Grep") {
  if (isSecretFile(ti.path)) hit = ti.path;
  else if (/(^|[\\/{,])\.env(?!\.example)/.test(String(ti.glob ?? ""))) hit = ti.glob;
}

if (hit) {
  process.stderr.write(
    `BLOQUEADO pelo harness: ${basename(String(hit))} guarda segredos de PRODUÇÃO e não é lido pela IA. ` +
      "Para saber se uma variável existe, confira o .env.example ou pergunte ao usuário.\n",
  );
  process.exit(2);
}
process.exit(0);

// PreToolUse (Edit|Write|MultiEdit): impede a IA de reescrever arquivos de
// segredo. .env.example (só nomes) continua editável.
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const file = String(input?.tool_input?.file_path ?? "");
const name = basename(file);

if (/^\.env(\..+)?$/.test(name) && name !== ".env.example") {
  process.stderr.write(
    `BLOQUEADO pelo harness: ${name} guarda segredos de produção. ` +
      "Diga ao usuário qual variável adicionar/alterar (e atualize .env.example com o NOME dela).\n",
  );
  process.exit(2);
}
process.exit(0);

// PreToolUse (Bash|PowerShell): barra comandos que ameaçam o banco de
// produção, leem segredo do .env ou escrevem direto no Neon fora do caminho
// aprovado. As regras (e o porquê de cada uma) estão em bash-rules.mjs.
import { readFileSync, statSync } from "node:fs";
import { checkCommand } from "./bash-rules.mjs";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const cmd = String(input?.tool_input?.command ?? "");

const why = checkCommand(cmd, {
  // Lê o arquivo que o comando vai executar (até 512 KB) para ver se importa o Prisma.
  readFile: (p) => {
    try {
      return statSync(p).size <= 512 * 1024 ? readFileSync(p, "utf8") : null;
    } catch {
      return null;
    }
  },
});

if (why) {
  process.stderr.write(`BLOQUEADO pelo harness: ${why}\n`);
  process.exit(2);
}
process.exit(0);

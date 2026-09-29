// PreToolUse (Bash|PowerShell): barra comandos que já destruíram ou ameaçam o
// banco de produção. O Neon tem drift de migration — `migrate dev` quer
// resetar o banco inteiro. Fluxo seguro: skill /migration.
import { readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const cmd = String(input?.tool_input?.command ?? "");

// Só casa quando o prisma é INVOCADO (npx/bunx/pnpm/yarn/.bin) — texto em
// mensagem de commit ou doc citando o comando não pode travar a sessão.
const PRISMA = String.raw`(?:(?:npx|bunx|pnpm(?:\s+exec)?|yarn)\s+|node_modules[\\/]\.bin[\\/])prisma`;
// DROP/TRUNCATE só importam quando há um executor de SQL no mesmo comando.
const SQL_RUNNER = /\b(psql|prisma\s+db\s+execute|\$executeRaw|\$queryRaw|neonctl)\b/i;

const RULES = [
  [new RegExp(`${PRISMA}\\s+migrate\\s+(dev|reset)\\b`, "i"), "prisma migrate dev/reset resetaria o Neon de PRODUÇÃO (drift de migration)."],
  [new RegExp(`${PRISMA}\\s+db\\s+push\\b[^\\n]*--(force-reset|accept-data-loss)`, "i"), "db push com perda de dados em produção."],
  [(c) => SQL_RUNNER.test(c) && /\bDROP\s+(TABLE|SCHEMA|DATABASE)\b/i.test(c), "DROP direto no banco."],
  [(c) => SQL_RUNNER.test(c) && /\bTRUNCATE\s+/i.test(c), "TRUNCATE direto no banco."],
  [/git\s+push\b[^\n]*(--force\b|-f\b)[^\n]*\bmain\b|git\s+push\b[^\n]*\bmain\b[^\n]*(--force\b|-f\b)/i, "force-push na main (deploy automático da Vercel)."],
];

for (const [re, why] of RULES) {
  if (typeof re === "function" ? re(cmd) : re.test(cmd)) {
    process.stderr.write(
      `BLOQUEADO pelo harness: ${why}\n` +
        "Use a skill /migration (migrate diff → db execute → migrate resolve) " +
        "ou peça ao usuário para rodar manualmente se for mesmo intencional.\n",
    );
    process.exit(2);
  }
}
process.exit(0);

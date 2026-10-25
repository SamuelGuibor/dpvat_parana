// Regras do guard-bash.mjs (puro, testado em tests/guard-bash.test.ts).
//
// Três famílias:
//  1. comandos que já destruíram ou ameaçam o banco (drift de migration do Neon);
//  2. leitura de segredo: o .env aponta para PRODUÇÃO e a IA não lê valores;
//  3. escrita direta no Neon fora do caminho aprovado (skill /migration ou
//     scripts/*.mjs, que exigem --apply para escrever) — a operação por IA
//     usa a API /api/op, nunca Prisma/SQL na máquina do operador.

// Só casa quando o prisma é INVOCADO (npx/bunx/pnpm/yarn/.bin) — texto em
// mensagem de commit ou doc citando o comando não pode travar a sessão.
const PRISMA = String.raw`(?:(?:npx|bunx|pnpm(?:\s+exec)?|yarn)\s+|node_modules[\\/]\.bin[\\/])prisma`;
// DROP/TRUNCATE só importam quando há um executor de SQL no mesmo comando.
const SQL_RUNNER = /\b(psql|prisma\s+db\s+execute|\$executeRaw|\$queryRaw|neonctl)\b/i;

const SECRET_NAMES =
  /\b(DATABASE_URL|DIRECT_URL|CRM_OP_TOKEN|CLAUDE_API_KEY|ANTHROPIC_API_KEY|GOOGLE_API_KEY|NEXT_?AUTH_SECRET|AWS_SECRET_ACCESS_KEY|CRON_SECRET|CHATBOT_SECRET|WHATSAPP_CRED_KEY|WHATSAPP_APP_SECRET|CONVERTER_API_KEY|META_ADS_TOKEN)\b/;
// Busca no código pelo NOME (grep "CRON_SECRET" app) continua livre; o que
// barra é imprimir o VALOR.
const PRINTS_ENV = /\b(echo|printf|printenv|Write-Host|Write-Output)\b|\$env:|\[Environment\]::GetEnvironmentVariable|\$\{?[A-Z_]{4,}\}?/;
const ENV_DUMP =
  /^\s*(printenv|env|set|export\s+-p)\s*(\||$)|\b(Get-ChildItem|gci|ls|dir)\s+env:|\bGet-Item\s+env:|\[Environment\]::GetEnvironmentVariables/i;
// Arquivo .env* citado no comando (".env.example" fica de fora: só nomes).
const ENV_FILE = /(^|[\s"'=/\\:(])\.env(?!\.example\b)(\.[\w.-]+)?(?=$|[\s"';|&)<>,])/;

const INLINE_EVAL = /\b(node|tsx|bun|deno)\b[^\n]*?\s(-e|--eval|-p|--print)\b/i;
const DB_CODE = /prisma|PrismaClient|\$executeRaw|\$queryRaw|neondatabase|\bpg\b|DATABASE_URL/i;
const SCRIPT_RUN = /\b(?:node|tsx|bun)\s+(?:(?:-r|--require|--import|--loader)\s+\S+\s+|--?[\w-]+(?:=\S+)?\s+)*["']?([^\s"']+\.(?:m?[jt]s|cjs))/gi;
// Onde rodar arquivo com Prisma é permitido: scripts revisados (dry-run por
// padrão, --apply para escrever), o próprio harness e o MCP.
const ALLOWED_SCRIPT_DIRS = /^(\.\/)?(scripts|tools[\\/]crm-mcp|\.claude[\\/]hooks)[\\/]/;
const FILE_DB_IMPORT = /@prisma\/client|PrismaClient|_shared\/lib\/prisma|from\s+["']pg["']|require\(["']pg["']\)|@neondatabase/;

// Etapa 5 (envio L4): só o MCP e os hooks falam com /api/op usando o token do
// operador. Um prompt forjado em /api/op/events seria um "aprovo <código>" que
// o operador não digitou. Barreira de texto (não de intenção): a outra trava é
// o pedido de permissão do Claude Code para Bash e para executar_aprovado.
const OP_CLIENT_DIRS = /^(\.\/)?(tools[\\/]crm-mcp|\.claude[\\/]hooks)[\\/]/;
// Interpretador rodando arquivo direto (npx/vitest ficam fora: teste é código revisado).
// Captura o trecho do comando depois do interpretador, até ; & | ou fim.
const INTERPRETER_RUN = /(?:^|[\s;&|(])(?:node|tsx|bun|deno|python3?|py|pwsh|powershell(?:\.exe)?|bash|sh)((?:[ \t]+[^\s;&|]+)+)/gi;
const SCRIPT_FILE = /["']?([^\s"'<>|;&]+\.(?:m?[jt]s|cjs|py|ps1|sh))(?=$|[\s"'<>|;&)])/gi;
const interpretedFiles = (c) => [...c.matchAll(INTERPRETER_RUN)].flatMap((m) => [...m[1].matchAll(SCRIPT_FILE)].map((f) => f[1]));
// Usa o token, ou fala com /api/op por rede (doc/teste que só CITA a rota passa).
const NET_CALL = /\bfetch\s*\(|\bhttps?\.request\b|\baxios\b|\burllib\b|\brequests\.(post|get)\b|\bInvoke-(WebRequest|RestMethod)\b|\bcurl\b|\bwget\b/i;
const usesOpApi = (src) => /CRM_OP_TOKEN/.test(src) || (/\/api\/op\b/.test(src) && NET_CALL.test(src));
const OP_API =
  "chamada direta à API de operação (/api/op) ou ao token do app. Use as ferramentas crm-op (MCP); prompt e aprovação só pelo operador.";

const BANCO = "Use a skill /migration (migrate diff → db execute → migrate resolve) ou peça ao usuário para rodar manualmente se for mesmo intencional.";
const SEGREDO = "O .env aponta para PRODUÇÃO: a IA não lê valores de segredo. Confira o .env.example (só nomes) ou pergunte ao usuário.";
const ESCRITA =
  "Escrita direta no Neon fora do caminho aprovado. Consulta/alteração de dado do CRM vai pelas ferramentas crm-op (API /api/op); script de manutenção mora em scripts/*.mjs com dry-run e --apply.";

/**
 * @param {string} cmd
 * @param {{ readFile?: (path: string) => string | null }} [io]
 * @returns {string | null} motivo do bloqueio, ou null se pode seguir
 */
export function checkCommand(cmd, io = {}) {
  const c = String(cmd ?? "");

  // 1. Banco: drift do Neon / perda de dados / deploy.
  if (new RegExp(`${PRISMA}\\s+migrate\\s+(dev|reset)\\b`, "i").test(c))
    return `prisma migrate dev/reset resetaria o Neon de PRODUÇÃO (drift de migration). ${BANCO}`;
  if (new RegExp(`${PRISMA}\\s+db\\s+push\\b[^\\n]*--(force-reset|accept-data-loss)`, "i").test(c))
    return `db push com perda de dados em produção. ${BANCO}`;
  if (SQL_RUNNER.test(c) && /\bDROP\s+(TABLE|SCHEMA|DATABASE)\b/i.test(c)) return `DROP direto no banco. ${BANCO}`;
  if (SQL_RUNNER.test(c) && /\bTRUNCATE\s+/i.test(c)) return `TRUNCATE direto no banco. ${BANCO}`;
  if (/git\s+push\b[^\n]*(--force\b|-f\b)[^\n]*\bmain\b|git\s+push\b[^\n]*\bmain\b[^\n]*(--force\b|-f\b)/i.test(c))
    return "force-push na main (deploy automático da Vercel).";

  // 2. Segredos.
  if (ENV_FILE.test(c)) return `comando cita um arquivo .env. ${SEGREDO}`;
  if (ENV_DUMP.test(c)) return `comando lista as variáveis de ambiente. ${SEGREDO}`;
  if (SECRET_NAMES.test(c) && PRINTS_ENV.test(c)) return `comando imprime uma variável de segredo. ${SEGREDO}`;

  // 3. Escrita direta no banco.
  if (/\b(psql|neonctl)\b/i.test(c)) return `cliente SQL direto no Neon. ${ESCRITA}`;
  if (new RegExp(`${PRISMA}\\s+studio\\b`, "i").test(c)) return `Prisma Studio edita produção pela tela. ${ESCRITA}`;
  const exec = c.match(new RegExp(`${PRISMA}\\s+db\\s+execute\\b([^\\n]*)`, "i"));
  if (exec && !/--file\s+["']?prisma[\\/]migrations[\\/]/i.test(exec[1]))
    return `prisma db execute fora de uma migration em prisma/migrations/. ${BANCO}`;
  if (INLINE_EVAL.test(c) && SECRET_NAMES.test(c)) return `código inline (node -e) lendo variável de segredo. ${SEGREDO}`;
  if (INLINE_EVAL.test(c) && DB_CODE.test(c)) return `código inline (node -e) mexendo no banco. ${ESCRITA}`;

  // 4. API de operação só pelo MCP: um prompt forjado em /api/op/events seria
  // um "aprovo <código>" que o operador não digitou (Etapa 5, envio L4).
  // O token do operador só é usado pelo MCP e pelos hooks: comando que o cita
  // (heredoc gravando um script, python -c, PowerShell) fica barrado; busca
  // pelo nome no código (grep/rg/git) continua livre.
  if (/\b(curl|wget|Invoke-WebRequest|Invoke-RestMethod|iwr|irm)\b|\bfetch\s*\(/i.test(c) && /\/api\/op\//i.test(c))
    return OP_API;
  if (/\bCRM_OP_TOKEN\b/.test(c) && !/^\s*(grep|rg|git)\b/.test(c)) return OP_API;

  // Arquivo executado (node/python/PowerShell/sh) que usa o token ou a API de
  // operação — fora do MCP e dos hooks — é o mesmo forjamento em dois passos.
  for (const file of interpretedFiles(c)) {
    if (OP_CLIENT_DIRS.test(file)) continue;
    const src = io.readFile?.(file);
    if (src && usesOpApi(src)) return `${file} usa o token ou a API de operação. ${OP_API}`;
  }

  for (const m of c.matchAll(SCRIPT_RUN)) {
    const file = m[1];
    if (ALLOWED_SCRIPT_DIRS.test(file)) continue;
    const src = io.readFile?.(file);
    if (src && FILE_DB_IMPORT.test(src)) return `${file} importa o Prisma/driver do banco e está fora de scripts/. ${ESCRITA}`;
  }
  return null;
}

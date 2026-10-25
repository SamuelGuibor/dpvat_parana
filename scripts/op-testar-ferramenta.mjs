// Roda UMA ferramenta da operação por IA (app/_shared/lib/op/tools) direto,
// sem passar pelo MCP nem pela rota — para testar ferramenta nova antes de o
// Claude Code recarregar o catálogo do MCP. L1 roda normal; L3 (escrita) roda
// SÓ a prévia — `confirmar` é forçado a false. Execução real de L3 é pelo app,
// com token, no card de teste: nunca adicione aqui um modo que grave.
// Valida os args com o mesmo zod da rota.
//
// Uso (PRODUÇÃO: o .env aponta para o Neon/S3):
//   node -r dotenv/config scripts/op-testar-ferramenta.mjs consultar_hospital '{"hospital":"angelina caron"}'
//   (mesmo comando) mover_card '{"card":"9999","coluna":"AUDITORIA"}'   → só prévia
//   --usuario=<id do User da equipe>  roda como essa pessoa (meu_dia, autor da prévia)
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const SCRIPT = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ROOT = join(dirname(SCRIPT), "..");
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const [nome, argsJson = "{}"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const usuario = flags.find((f) => f.startsWith("--usuario="))?.slice("--usuario=".length) || "script";
if (!nome) {
  console.error("Uso: op-testar-ferramenta.mjs <ferramenta> '<args JSON>'");
  process.exit(1);
}

const require = createRequire(import.meta.url);
const jitiMod = require("jiti");
const createJiti = jitiMod.createJiti ?? jitiMod.default ?? jitiMod;
const jiti = createJiti(SCRIPT, { interopDefault: true, cache: false, alias: { "@": ROOT } });
const mod = await (typeof jiti.import === "function"
  ? jiti.import("../app/_shared/lib/op/tools/index.ts")
  : jiti("../app/_shared/lib/op/tools/index.ts"));

const tool = mod.getTool(nome);
if (!tool) {
  console.error(`Ferramenta desconhecida: ${nome}. Existem: ${mod.OP_TOOLS.map((t) => t.name).join(", ")}`);
  process.exit(1);
}
if (tool.level !== 1 && tool.level !== 3) {
  console.error(`${nome} é nível ${tool.level}: este script só roda leitura (L1) e prévia de L3.`);
  process.exit(1);
}
const rawArgs = JSON.parse(argsJson);
if (tool.level === 3) {
  if (rawArgs.confirmar) console.error("aviso: confirmar ignorado — o script só mostra a prévia de L3.");
  rawArgs.confirmar = false;
  delete rawArgs.previa_hash;
}
const parsed = tool.schema.safeParse(rawArgs);
if (!parsed.success) {
  console.error("argumentos_invalidos:", parsed.error.issues.map((i) => i.message).join("; "));
  process.exit(1);
}
// Contexto mínimo: quase nenhuma L1 lê o operador (minhas_permissoes e meu_dia leem).
const ctx = {
  op: { userId: usuario, name: "script local", email: "", role: "ADMIN++", permissions: { op_use: true }, tokenId: "script" },
  trace: { sessionId: null, requestId: null },
};
if (tool.level === 3 && parsed.data.confirmar !== false) {
  console.error("recusado: L3 só em prévia.");
  process.exit(1);
}
const t0 = Date.now();
try {
  const r = await tool.run(ctx, parsed.data);
  console.log(JSON.stringify({ ok: true, ms: Date.now() - t0, summary: r.summary, data: r.data }, null, 2));
} catch (e) {
  console.log(JSON.stringify({ ok: false, code: e.code ?? "erro", message: e.message, details: e.details }, null, 2));
} finally {
  const { db } = await jiti.import("../app/_shared/lib/prisma.ts");
  await db.$disconnect();
}

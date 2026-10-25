// Roda UMA ferramenta da operação por IA (app/_shared/lib/op/tools) direto,
// sem passar pelo MCP nem pela rota — para testar ferramenta nova antes de o
// Claude Code recarregar o catálogo do MCP. Só use ferramenta L1 (leitura):
// o script recusa qualquer outra. Valida os args com o mesmo zod da rota.
//
// Uso (PRODUÇÃO: o .env aponta para o Neon/S3; só leitura):
//   node -r dotenv/config scripts/op-testar-ferramenta.mjs consultar_hospital '{"hospital":"angelina caron"}'
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const SCRIPT = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ROOT = join(dirname(SCRIPT), "..");
const [nome, argsJson = "{}"] = process.argv.slice(2);
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
if (tool.level !== 1) {
  console.error(`${nome} é nível ${tool.level}: este script só roda leitura (L1).`);
  process.exit(1);
}
const parsed = tool.schema.safeParse(JSON.parse(argsJson));
if (!parsed.success) {
  console.error("argumentos_invalidos:", parsed.error.issues.map((i) => i.message).join("; "));
  process.exit(1);
}
// Contexto mínimo: as ferramentas L1 de hoje não leem o operador (minhas_permissoes lê).
const ctx = { op: { userId: "script", name: "script local", email: "", role: "ADMIN++", permissions: { op_use: true }, tokenId: "script" } };
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

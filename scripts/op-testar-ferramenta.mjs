// Roda UMA ferramenta da operação por IA (app/_shared/lib/op/tools) direto,
// sem passar pelo MCP nem pela rota — para testar ferramenta nova antes de o
// Claude Code recarregar o catálogo do MCP. L1 roda normal; L2 (preparar_*)
// roda de verdade e grava SÓ o rascunho em op-drafts/ do S3 (vence em 7 dias;
// anote a key); L3 (escrita) roda SÓ a prévia — `confirmar` é forçado a false;
// L4 (Etapa 5): só `preparar_*`, em modo previewOnly — monta a prévia do
// e-mail/WhatsApp SEM gravar a aprovação e sem código; `executar_aprovado`
// é recusado. Execução real de L3/L4 é pelo app, com token, no card de teste:
// nunca adicione aqui um modo que grave no banco ou envie algo.
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
const isL4Prepare = tool.level === 4 && /^preparar_/.test(tool.name);
if (tool.level !== 1 && tool.level !== 2 && tool.level !== 3 && !isL4Prepare) {
  console.error(`${nome} é nível ${tool.level}: este script só roda leitura (L1), rascunho (L2), prévia de L3 e prévia de preparar_* (L4).`);
  process.exit(1);
}
if (isL4Prepare) console.error("aviso: L4 em modo prévia — nada é gravado nem enviado, sem código de aprovação.");
if (tool.level === 2) console.error("aviso: L2 grava o rascunho no S3 (op-drafts/, vence em 7 dias). O card não muda.");
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
  // L4: preparar_* não grava a aprovação (e sem sessão nem conseguiria).
  previewOnly: true,
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

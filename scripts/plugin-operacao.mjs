// Monta o plugin do operador (decisão do dono de 30/10): a equipe usa as
// skills da operação pelo app do Claude SEM receber o repositório. O pacote
// leva só skills de operação + MCP crm-op + hooks de registro/aprovação; nada
// de app/, prisma/, .env ou skills de desenvolvimento.
//
// A fonte continua aqui (.claude/skills, tools/crm-mcp, .claude/hooks): este
// script copia para a pasta do repositório PRIVADO do plugin, que o dono
// commita e dá push. Os operadores recebem a versão nova sozinhos (autoUpdate
// no settings.json da pasta deles; o plugin muda de versão a cada commit daqui).
//
//   npm run plugin:publicar                                  # o de sempre: gera, commita e dá push no repo do plugin
//   node scripts/plugin-operacao.mjs                         # dry-run: lista o que geraria
//   node scripts/plugin-operacao.mjs --apply                 # só grava na pasta (recusa com mudança sem commit; --forcar para teste)
//   ... --publicar                                           # + commit e push no repo do plugin (exige --apply)
//   ... --saida=<pasta> (padrão: crm-operacao-plugin ao lado de D:\dpvat_parana)
//   ... --repo=SamuelGuibor/crm-operacao-plugin              # repo do catálogo (padrão)
//
// Mapa: docs/ai/operacao-ia.md (seção "Plugin do operador").

import { execSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const APPLY = process.argv.includes("--apply");
const PUBLICAR = process.argv.includes("--publicar");
// Clone do repo do plugin: D:\crm-operacao-plugin (o repo do CRM fica em D:\dpvat_parana\dpvat_parana).
const SAIDA = resolve(arg("saida", join(ROOT, "..", "..", "crm-operacao-plugin")));
const REPO = arg("repo", "SamuelGuibor/crm-operacao-plugin");

const PLUGIN = "crm";
const MARKETPLACE = "seguros-parana";
// Nome que o Claude Code dá às ferramentas de MCP de plugin.
const TOOL_PREFIX = `mcp__plugin_${PLUGIN}_crm-op__`;

// Skills de operação que vão para a equipe. Fora: plano, validar, migration,
// mapa-atualizar (desenvolvimento), publicar-conhecimento (roda scripts do
// repo) e contrato (NÃO TESTADA, dirige o Chrome do operador no ZapSign —
// entra depois do teste; plano em docs/ai-first/12-plano-vm-segundo-plano.md).
const SKILLS = [
  "auditoria-operacao",
  "cliente",
  "conhecimento",
  "crm",
  "documentos",
  "hospital",
  "meu-dia",
  "meu-rendimento",
  "parados",
  "pedido-prontuario",
  "pendencias",
  "processo",
  "procuracao",
  "prontuario",
  "retomar",
  "varredura",
  "whatsapp",
];

// Ferramentas no allow da pasta do operador além das do .claude/settings.json
// (ponte para ferramenta nova antes de o dono pôr no settings.json).
// preparar_membro_equipe e executar_aprovado ficam FORA, como no repositório.
const ALLOW_EXTRA = [];
const NUNCA_NO_ALLOW = new Set(["executar_aprovado", "preparar_acao_irreversivel", "preparar_membro_equipe", "aplicar_regra_bot"]);

// Nota que entra no fim da skill dentro do plugin: na máquina do operador não
// há repositório (docs/operacao, scripts, git).
const NOTA_PLUGIN = {
  conhecimento:
    "\n\n## No plugin (computador do operador)\nAqui não há o repositório: `docs/operacao/` e as skills não estão em disco para editar. Modo **sugerir** funciona igual (checagem pelo `consultar_hospital` e, no destino bot, `analisar_regra_bot`; Grep só em `${CLAUDE_PLUGIN_ROOT}/skills/`). Modo **implementar** com destino vault ou skill é no computador do dono (repositório); destino bot funciona aqui (`aplicar_regra_bot`).\n",
};

function sh(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}

function versao() {
  const hash = sh("git rev-parse --short HEAD");
  // settings.json entra porque o allow da pasta do operador sai dele; o script porque monta o pacote.
  const sujo = sh("git status --porcelain -- .claude/skills tools/crm-mcp .claude/hooks tools/operacao-plugin .claude/settings.json scripts/plugin-operacao.mjs") !== "";
  // Data de Brasília: a Vercel/CI rodam em UTC, aqui é só rótulo.
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date()).replaceAll("-", ".");
  return { versao: `${dia}-${hash}${sujo ? "-local" : ""}`, sujo };
}

/** Texto da skill no plugin: caminhos do repositório → raiz do plugin. */
function reescreverSkill(nome, texto) {
  let t = texto.replaceAll(".claude/skills/", "${CLAUDE_PLUGIN_ROOT}/skills/");
  // Chamadas de skill no texto ("/retomar", "/prontuario") ganham o prefixo do plugin.
  t = t.replace(/(^|[\s(`"'])\/(?=(?:[a-z-]+)\b)([a-z][a-z-]+)\b/g, (m, pre, s) => (SKILLS.includes(s) ? `${pre}/${PLUGIN}:${s}` : m));
  // description entre aspas: ": " solto quebra o YAML e o Claude Code descarta
  // o frontmatter inteiro em silêncio (a skill perde a descrição e o gatilho).
  t = t.replace(/^description: (?!")(.*)$/m, (_, d) => `description: ${JSON.stringify(d.trim())}`);
  return t + (NOTA_PLUGIN[nome] ?? "");
}

function allowDoOperador() {
  const repo = JSON.parse(readFileSync(join(ROOT, ".claude/settings.json"), "utf8"));
  const doRepo = (repo.permissions?.allow ?? []).filter((r) => r.startsWith("mcp__crm-op__")).map((r) => r.slice("mcp__crm-op__".length));
  const nomes = [...new Set([...doRepo, ...ALLOW_EXTRA])].filter((n) => !NUNCA_NO_ALLOW.has(n)).sort();
  return nomes.map((n) => TOOL_PREFIX + n);
}

function settingsDoOperador() {
  return {
    $schema: "https://json.schemastore.org/claude-code-settings.json",
    // autoUpdate: marketplace de terceiros nasce SEM atualização automática; com
    // ela, o app busca a versão nova depois da 1ª mensagem e carrega na próxima abertura.
    extraKnownMarketplaces: { [MARKETPLACE]: { source: { source: "github", repo: REPO }, autoUpdate: true } },
    enabledPlugins: { [`${PLUGIN}@${MARKETPLACE}`]: true },
    permissions: {
      allow: allowDoOperador(),
      // A pasta não tem código e a IA não precisa de terminal nem de escrever
      // arquivo: sem Bash não há como forjar chamada à API com o token.
      // WebFetch fora: dado de cliente lido pela IA não sai por URL (injeção em
      // comentário ou mensagem de cliente).
      deny: ["Bash", "PowerShell", "Edit", "Write", "NotebookEdit", "WebFetch"],
    },
  };
}

/** Lista de [destino relativo, conteúdo|caminho de origem]. */
function montar() {
  const { versao: v } = versao();
  const out = [];
  const tpl = join(ROOT, "tools/operacao-plugin/template");
  const walk = (dir) =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  for (const f of walk(tpl)) {
    const rel = relative(tpl, f).replaceAll("\\", "/");
    if (rel === `plugins/${PLUGIN}/.claude-plugin/plugin.json`) {
      const pj = JSON.parse(readFileSync(f, "utf8"));
      out.push([rel, JSON.stringify({ ...pj, version: v }, null, 2) + "\n"]);
    } else out.push([rel, { from: f }]);
  }
  const base = `plugins/${PLUGIN}`;
  out.push([`${base}/server/crm-mcp.mjs`, { from: join(ROOT, "tools/crm-mcp/index.mjs") }]);
  for (const h of ["op-prompt.mjs", "op-response.mjs", "op-tool.mjs"]) out.push([`${base}/hooks/${h}`, { from: join(ROOT, ".claude/hooks", h) }]);
  for (const s of SKILLS) {
    const dir = join(ROOT, ".claude/skills", s);
    if (!existsSync(join(dir, "SKILL.md"))) throw new Error(`skill sem SKILL.md: ${s}`);
    for (const f of walk(dir)) {
      const rel = relative(dir, f).replaceAll("\\", "/");
      out.push([`${base}/skills/${s}/${rel}`, f.endsWith(".md") ? reescreverSkill(s, readFileSync(f, "utf8")) : { from: f }]);
    }
  }
  const op = join(ROOT, "tools/operacao-plugin");
  out.push(["operador/CLAUDE.md", { from: join(op, "pasta-operador/CLAUDE.md") }]);
  out.push(["operador/.claude/settings.json", JSON.stringify(settingsDoOperador(), null, 2) + "\n"]);
  out.push(["operador/instalar.ps1", readFileSync(join(op, "instalar-operador.ps1"), "utf8").replaceAll("__REPO__", REPO)]);
  out.push(["README.md", { from: join(op, "README.md") }]);
  return { arquivos: out, versao: v };
}

// Nada do CRM pode vazar no pacote (a segurança do operador depende disso):
// caminho proibido e, no conteúdo, cara de segredo (token do app, URL de
// banco, chave AWS, chave privada).
const PROIBIDO = /(^|\/)(\.env[^/]*|app|prisma|node_modules|\.next|docs\/ai)(\/|$)/;
const SEGREDO = /crmop_[A-Za-z0-9_-]{20,}|postgres(ql)?:\/\/\S+@|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;

const { arquivos, versao: v } = montar();
for (const [rel, conteudo] of arquivos) {
  if (PROIBIDO.test(rel)) throw new Error(`arquivo proibido no pacote: ${rel}`);
  const texto = typeof conteudo === "string" ? conteudo : readFileSync(conteudo.from, "utf8");
  if (SEGREDO.test(texto)) throw new Error(`conteúdo com cara de segredo no pacote: ${rel}`);
}

console.log(`Plugin ${PLUGIN}@${MARKETPLACE} versão ${v} → ${SAIDA}`);
console.log(`Catálogo no GitHub: ${REPO} · ${arquivos.length} arquivo(s) · ${SKILLS.length} skill(s)`);
for (const [rel] of arquivos) console.log(`  ${rel}`);
if (v.endsWith("-local")) console.log("\n⚠ Há mudança sem commit em skills/MCP/hooks: a versão sai com -local. Commite antes de publicar.");

if (!APPLY) {
  console.log("\nDry-run. Rode de novo com --apply para gravar.");
  process.exit(0);
}
// Publicado sem commit não tem origem rastreável e duas publicações sujas no
// mesmo dia teriam a mesma versão (o operador não receberia a segunda).
if (v.endsWith("-local") && !process.argv.includes("--forcar")) {
  console.error("\n✘ Recusado: commite antes de publicar (ou --forcar para gerar uma pasta de teste).");
  process.exit(1);
}

// Só as pastas que este script gera são limpas; o .git do repositório do plugin fica.
for (const d of [`plugins/${PLUGIN}`, "operador", ".claude-plugin"]) rmSync(join(SAIDA, d), { recursive: true, force: true });
for (const [rel, conteudo] of arquivos) {
  const dest = join(SAIDA, rel);
  mkdirSync(dirname(dest), { recursive: true });
  if (typeof conteudo === "string") writeFileSync(dest, conteudo);
  else cpSync(conteudo.from, dest);
}
if (!PUBLICAR) {
  console.log(`\n✔ Gravado. Para publicar: npm run plugin:publicar (ou, na pasta ${SAIDA}: git add -A && git commit && git push)`);
  process.exit(0);
}
if (v.endsWith("-local")) {
  console.error("\n✘ Versão -local não é publicada (pasta de teste gerada, nada enviado).");
  process.exit(1);
}
// Commit + push no repo do plugin. Sem mudança = nada a publicar (a versão
// só muda com commit novo aqui, e o operador só recebe quando ela muda).
const git = (cmd) => execSync(`git ${cmd}`, { cwd: SAIDA, encoding: "utf8" }).trim();
if (!existsSync(join(SAIDA, ".git"))) {
  console.error(`\n✘ ${SAIDA} não é um clone do repo do plugin (git clone https://github.com/${REPO}.git).`);
  process.exit(1);
}
// Skill que cita ferramenta nova antes do deploy = operador recebe ferramenta_desconhecida.
try {
  if (Number(sh("git rev-list --count @{u}..HEAD")) > 0) console.log("⚠ O commit do CRM ainda não foi para a main (push): ferramenta nova só existe depois do deploy da Vercel.");
} catch {
  // sem upstream configurado: só não avisa
}
git("add -A");
if (!git("status --porcelain")) {
  console.log("\n= Nada mudou no pacote desde a última publicação. Nada enviado.");
  process.exit(0);
}
execSync(`git commit -q -F -`, { cwd: SAIDA, input: `Plugin ${v}\n\nGerado por scripts/plugin-operacao.mjs a partir de ${sh("git rev-parse --short HEAD")} do CRM.\n` });
git("push -q");
console.log(
  `\n✔ Publicado: ${PLUGIN}@${MARKETPLACE} ${v} no ${REPO}. A equipe baixa sozinha (autoUpdate) e carrega na próxima abertura do app; na hora: claude plugin update ${PLUGIN}@${MARKETPLACE} + reabrir.`,
);

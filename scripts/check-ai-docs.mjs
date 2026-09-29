// Confere se os mapas de IA (CLAUDE.md + docs/ai/*.md + .claude/skills|agents)
// ainda batem com o código: todo caminho citado entre crases tem que existir, e
// todo símbolo citado (identificador em crases) tem que aparecer no código.
// Uso: node scripts/check-ai-docs.mjs   (exit 1 se achar referência quebrada)
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";

const ROOT = process.cwd();
const EXTERNAL = [/^D:[\\/]/i, /^https?:/, /^\$ARGUMENTS$/];
// Microserviços em outros repos (os mapas do bot/documentos citam símbolos de lá).
const EXTERNAL_REPOS = ["D:/Chatbot_whatsapp", "D:/docx-converter"].filter((d) => existsSync(d));
// Nomes citados de propósito que não são símbolos do código: APIs/erros de
// plataforma, exemplos de uso, arquivos gerados ou de terceiros.
const IGNORE = new Set([
  "getHours", "getDate", "waitUntil", "refreshWhenHidden", "Grep", "FUNCTION_PAYLOAD_TOO_LARGE",
  "Dockerfile", "add_card_priority", "pdf.worker.mjs", "encoderWorker.min.js", "discord.js", "current.json",
]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "public", "mapa-obsidian"].includes(name)) continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const all = walk(ROOT);
const extFiles = EXTERNAL_REPOS.flatMap((d) => walk(d));
const docs = all.filter((p) => {
  const r = relative(ROOT, p).replace(/\\/g, "/");
  return r === "CLAUDE.md" || r.endsWith("/CLAUDE.md") || /^docs\/ai\/.+\.md$/.test(r) || /^\.claude\/(skills|agents)\/.+\.md$/.test(r);
});
const code =
  [...all, ...extFiles]
    .filter((p) => /\.(ts|tsx|mjs|js|prisma|json|sql)$/.test(p) && !/package-lock/.test(p))
    .map((p) => readFileSync(p, "utf8"))
    .join("\n") + (existsSync(join(ROOT, ".env.example")) ? readFileSync(join(ROOT, ".env.example"), "utf8") : "");

const looksLikePath = (s) =>
  /^(app|prisma|docs|tests|scripts|templates|templates-assinatura|public|railway|vercel|\.github|\.claude)\//.test(s) ||
  /^[\w.-]+\.(ts|tsx|mjs|js|json|md|prisma|cmd|mts)$/.test(s);
const looksLikeSymbol = (s) => /^[A-Za-z_$][\w$]{3,}(\(\))?$/.test(s) && /[A-Z_]|[a-z][A-Z]/.test(s);

let bad = 0;
for (const doc of docs) {
  const rel = relative(ROOT, doc).replace(/\\/g, "/");
  // Seções de proposta (nomes que ainda não existem) ficam fora da checagem.
  const text = readFileSync(doc, "utf8").split(/^## Backlog/m)[0];
  const refs = new Set([...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim()));
  for (let ref of refs) {
    if (EXTERNAL.some((re) => re.test(ref)) || IGNORE.has(ref) || ref.includes("-N.")) continue;
    ref = ref.replace(/[#:].*$/, "").replace(/\/\*\*?$/, "").replace(/\/$/, "");
    if (looksLikePath(ref)) {
      if (/[<*{]/.test(ref)) continue; // padrão, não arquivo
      const bare = !ref.includes("/");
      const found =
        [join(ROOT, ref), join(dirname(doc), ref)].some((p) => existsSync(p)) ||
        (bare && [...all, ...extFiles].some((p) => p.endsWith("\\" + ref) || p.endsWith("/" + ref)));
      if (!found) { console.log(`PATH  ${rel}: ${ref}`); bad++; }
    } else if (looksLikeSymbol(ref)) {
      const sym = ref.replace(/\(\)$/, "");
      if (!code.includes(sym)) { console.log(`SYM   ${rel}: ${sym}`); bad++; }
    }
  }
}
console.log(`\n${docs.length} docs verificados · ${bad} referência(s) quebrada(s)`);
process.exit(bad ? 1 : 0);

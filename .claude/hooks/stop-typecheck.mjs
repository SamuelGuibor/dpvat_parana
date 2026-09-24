// Stop: se algum .ts/.tsx mudou desde a última checagem, roda `tsc --noEmit`
// (incremental, ~30s). A linha de base da main é 0 erros, então qualquer erro
// é novo — devolve para a IA corrigir antes de encerrar o turno.
// eslint fica fora (≈40s por arquivo); roda no /validar.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";

const input = JSON.parse(readFileSync(0, "utf8") || "{}");
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const sh = (c) => execSync(c, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 });

let fingerprint;
try {
  const diff = sh("git diff HEAD -- *.ts *.tsx");
  const untracked = sh("git ls-files --others --exclude-standard -- *.ts *.tsx");
  if (!diff.trim() && !untracked.trim()) process.exit(0);
  const untrackedBodies = untracked
    .split("\n")
    .filter(Boolean)
    .map((f) => { try { return readFileSync(join(root, f), "utf8"); } catch { return ""; } })
    .join("\0");
  fingerprint = createHash("sha1").update(diff + "\0" + untracked + untrackedBodies).digest("hex");
} catch {
  process.exit(0); // sem git → não atrapalha
}

const cacheDir = join(root, ".claude", ".cache");
const stamp = join(cacheDir, "typecheck-ok");
if (existsSync(stamp) && readFileSync(stamp, "utf8") === fingerprint) process.exit(0);

try {
  sh("npx tsc --noEmit");
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(stamp, fingerprint);
  process.exit(0);
} catch (e) {
  const out = String(e.stdout || "") + String(e.stderr || "");
  const errors = out.split("\n").filter((l) => /error TS\d+/.test(l));
  if (errors.length === 0) process.exit(0); // falha de ambiente, não de tipo
  // Já bloqueamos uma vez neste turno: avisa sem prender a sessão em loop.
  const code = input?.stop_hook_active ? 0 : 2;
  process.stderr.write(
    `tsc --noEmit: ${errors.length} erro(s) de tipo (a main tem 0). Corrija antes de encerrar:\n` +
      errors.slice(0, 25).join("\n") +
      (errors.length > 25 ? `\n… +${errors.length - 25}` : "") +
      "\n",
  );
  process.exit(code);
}

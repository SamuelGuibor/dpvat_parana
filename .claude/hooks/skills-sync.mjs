// SessionStart: traz as skills novas do Cérebro APP para a máquina do operador
// (decisão D1 de 27/10, docs/ai-first/11-plano-cerebro-app.md). A skill
// alterada por ticket é commitada na main; aqui cada Claude Code que abre faz
// `git fetch` e, se a main local só está ATRÁS (sem commit próprio e sem
// arquivo modificado), avança com `merge --ff-only`. Nunca faz merge de
// verdade, rebase, stash nem checkout de arquivo: qualquer outra situação só
// avisa.
//
// O stdout deste hook vira contexto da conversa: só escreve quando atualizou
// skill (para o modelo avisar "reinicie o Claude Code": skill nova só carrega
// ao reiniciar) ou quando há skill nova que não deu para trazer.
// NUNCA bloqueia: qualquer falha sai com 0 em silêncio. Sem rede, o fetch
// desiste em 8 s.
import { execFileSync } from "node:child_process";

const SKILLS = ".claude/skills";

function git(args, timeout = 8000) {
  return execFileSync("git", args, { encoding: "utf8", timeout, stdio: ["ignore", "pipe", "ignore"] }).trim();
}

try {
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch !== "main") process.exit(0);
  // Upstream da main ("dpvat/main" nesta máquina, "origin/main" num clone novo).
  const up = git(["rev-parse", "--abbrev-ref", "main@{upstream}"]);
  const [remote, ...rest] = up.split("/");
  git(["fetch", "--quiet", remote, rest.join("/")]);
  const atras = Number(git(["rev-list", "--count", `HEAD..${up}`]));
  if (!atras) process.exit(0);
  const mudadas = git(["diff", "--name-only", "HEAD", up, "--", SKILLS])
    .split("\n")
    .filter(Boolean)
    .map((f) => f.split("/")[2])
    .filter((v, i, a) => v && a.indexOf(v) === i);

  const frente = Number(git(["rev-list", "--count", `${up}..HEAD`]));
  const sujo = git(["status", "--porcelain", "--untracked-files=no"]) !== "";
  if (frente || sujo) {
    if (mudadas.length) {
      console.log(
        `[skills] Há skill nova na main (${mudadas.map((s) => "/" + s).join(", ")}), mas esta pasta tem ${frente ? "commit próprio" : "arquivo modificado"}: não atualizei. Avise o operador para atualizar o repositório (git pull) e reiniciar o Claude Code.`,
      );
    }
    process.exit(0);
  }

  git(["merge", "--ff-only", "--quiet", up], 20000);
  if (mudadas.length) {
    console.log(
      `[skills] Skills atualizadas da main: ${mudadas.map((s) => "/" + s).join(", ")}. Avise o operador: reinicie o Claude Code para carregar a versão nova.`,
    );
  }
} catch {
  // rede, git ausente, conflito: nunca atrapalha o início da sessão
}
process.exit(0);

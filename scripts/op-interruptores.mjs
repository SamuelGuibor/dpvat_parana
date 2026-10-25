// Liga/desliga os interruptores da IA de operação (app_settings
// `op_l3_switches`) sem o painel do Espaço de Trabalho — que ficou no branch
// `ia-operacao-telas` (25/10). Grava pelo mesmo `setOpSwitch` do painel: mesma
// chave, mesmo log `update` com `metadata.stage = "op_switch"` e o autor.
//
// Só ferramentas que TÊM interruptor (L3, L4 e as L1 `switchable`); nome
// desconhecido ou sem interruptor = erro, nada gravado. O autor do --apply
// precisa ser da equipe com `manage_team` (o mesmo guard da action do painel).
// O efeito leva até ~15 s em cada instância da Vercel (cache do kill switch).
//
// Uso (PRODUÇÃO: o .env aponta para o Neon):
//   node -r dotenv/config scripts/op-interruptores.mjs                                  # lista o estado (READ ONLY)
//   node -r dotenv/config scripts/op-interruptores.mjs --ligar=mover_card,adicionar_tag   # dry-run: mostra o plano
//   node -r dotenv/config scripts/op-interruptores.mjs --desligar=mover_card
//   node -r dotenv/config scripts/op-interruptores.mjs --desligar-tudo
//   ... --apply --autor=<e-mail do Super Admin>                                         # grava
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const SCRIPT = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ROOT = join(dirname(SCRIPT), "..");
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? null;
const list = (name) => (flag(name) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const ligar = list("ligar");
const desligar = list("desligar");
const desligarTudo = args.includes("--desligar-tudo");
const autorEmail = flag("autor");

const require = createRequire(import.meta.url);
const jitiMod = require("jiti");
const createJiti = jitiMod.createJiti ?? jitiMod.default ?? jitiMod;
const jiti = createJiti(SCRIPT, { interopDefault: true, cache: false, alias: { "@": ROOT } });
const load = (p) => (typeof jiti.import === "function" ? jiti.import(p) : jiti(p));

const { OP_TOOLS } = await load("../app/_shared/lib/op/tools/index.ts");
const S = await load("../app/_shared/lib/op/switches.ts");
const { resolvePermissions, isTeamRole } = await load("../app/_shared/lib/permissions.ts");
const { brDateTime } = await load("../app/_shared/lib/op/resolve.ts");
const { db } = await load("../app/_shared/lib/prisma.ts");

const comInterruptor = OP_TOOLS.filter((t) => S.hasSwitch(t));
const byName = new Map(comInterruptor.map((t) => [t.name, t]));

function fail(msg) {
  console.error(`erro: ${msg}`);
  process.exitCode = 1;
}

try {
  const { atual, ultimos } = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const row = await tx.appSetting.findUnique({ where: { key: S.OP_SWITCHES_KEY } });
    // Corte de data: "update" é frequente e o filtro no JSON não tem índice.
    const logs = await tx.log.findMany({
      where: { action: "update", createdAt: { gte: new Date(Date.now() - 180 * 86_400_000) }, metadata: { path: ["stage"], equals: "op_switch" } },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: { authorName: true, createdAt: true, metadata: true },
    });
    return { atual: S.parseOpSwitches(row?.value), ultimos: logs };
  });

  console.log(`\n== Interruptores da IA de operação (${comInterruptor.length}) ==\n`);
  for (const t of comInterruptor) {
    const last = ultimos.find((l) => l.metadata?.tool === t.name);
    const quando = last ? ` · ${last.metadata.on ? "ligada" : "desligada"} por ${last.authorName} em ${brDateTime(last.createdAt)}` : "";
    console.log(`  ${atual[t.name] === true ? "LIGADA   " : "desligada"}  L${t.level}  ${t.name.padEnd(24)}${quando}`);
  }

  const desconhecidos = [...ligar, ...desligar].filter((n) => !byName.has(n));
  const conflito = ligar.filter((n) => desligar.includes(n));
  if (desconhecidos.length) {
    fail(`sem interruptor ou inexistente: ${desconhecidos.join(", ")}. Válidos: ${[...byName.keys()].join(", ")}`);
  } else if (conflito.length) {
    fail(`a mesma ferramenta em --ligar e --desligar: ${conflito.join(", ")}`);
  } else if (ligar.length || desligar.length || desligarTudo) {
    const alvo = new Map();
    if (desligarTudo) for (const t of comInterruptor) alvo.set(t.name, false);
    for (const n of desligar) alvo.set(n, false);
    for (const n of ligar) alvo.set(n, true);
    const mudancas = [...alvo].filter(([n, on]) => (atual[n] === true) !== on);

    console.log(`\nPlano (${mudancas.length} mudança(s)):`);
    for (const [n, on] of mudancas) console.log(`  ${on ? "ligar   " : "desligar"}  ${n}`);
    if (!mudancas.length) console.log("  nada a mudar — já está assim.");

    if (mudancas.length && !APPLY) {
      console.log("\nDry-run: nada gravado. Para gravar: acrescente --apply --autor=<seu e-mail>.");
    } else if (mudancas.length && APPLY) {
      if (!autorEmail) {
        fail("--apply exige --autor=<e-mail> (vai no log do interruptor).");
      } else {
        const autor = await db.user.findFirst({
          where: { email: { equals: autorEmail, mode: "insensitive" } },
          select: { id: true, name: true, email: true, role: true, permissions: true },
        });
        if (!autor || !isTeamRole(autor.role) || !resolvePermissions(autor.role, autor.permissions).manage_team) {
          fail(`"${autorEmail}" não é da equipe com manage_team (Super Admin). Nada gravado.`);
        } else {
          for (const [n, on] of mudancas) {
            await S.setOpSwitch(n, on, { id: autor.id, name: autor.name ?? autor.email });
            console.log(`  ✔ ${on ? "ligada" : "desligada"}: ${n}`);
          }
          console.log("\nGravado. Vale em até ~15 s em cada instância; no Claude Code, reinicie para o catálogo mostrar a mudança.");
        }
      }
    }
  }
  console.log("");
} finally {
  await db.$disconnect();
}

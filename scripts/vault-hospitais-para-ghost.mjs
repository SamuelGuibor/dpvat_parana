// Preenche o contato do hospital nos GHOST (colunas hospital_email,
// hospital_telefone, hospital_modo) a partir das notas PUBLICADAS do vault
// (docs/operacao/hospitais/*.md). Etapa 5 da IA de operação: é de onde o
// preparar_email tira o destinatário do pedido de prontuário.
//
// Regras (conservadoras, app/_shared/utils/hospital-contact.ts):
//   - só nota com status `publicado`; só contato ÚNICO (2 e-mails = escolha humana);
//   - casa o GHOST pelo `ghost_id` da nota ou, sem ele, pelo nome normalizado;
//   - só grava coluna VAZIA: valor diferente já no GHOST = "conflito", nunca sobrescreve;
//   - nunca cria nem apaga GHOST (os apagadores são seed-hospitals/migrate-hospitals:
//     não rode esses).
//
// Uso (PRODUÇÃO: o .env aponta para o Neon):
//   node -r dotenv/config scripts/vault-hospitais-para-ghost.mjs           # dry-run (só lê, READ ONLY)
//   node -r dotenv/config scripts/vault-hospitais-para-ghost.mjs --apply   # grava (o DONO roda)
import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";

const SCRIPT = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ROOT = join(dirname(SCRIPT), "..");
const APPLY = process.argv.includes("--apply");
const DIR = join(ROOT, "docs/operacao/hospitais");

const require = createRequire(import.meta.url);
const jitiMod = require("jiti");
const createJiti = jitiMod.createJiti ?? jitiMod.default ?? jitiMod;
const jiti = createJiti(SCRIPT, { interopDefault: true, cache: false, alias: { "@": ROOT } });
const load = (p) => (typeof jiti.import === "function" ? jiti.import(p) : jiti(p));
const V = await load("../app/_shared/utils/vault.ts");
const H = await load("../app/_shared/utils/hospital-contact.ts");

const db = new PrismaClient();
const FIELDS = [
  ["email", "hospital_email"],
  ["telefone", "hospital_telefone"],
  ["modo", "hospital_modo"],
];

try {
  const ghosts = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return tx.user.findMany({
      where: { role: "GHOST" },
      select: { id: true, name: true, hospital_email: true, hospital_telefone: true, hospital_modo: true },
    });
  });
  const byId = new Map(ghosts.map((g) => [g.id, g]));
  const byName = new Map(ghosts.map((g) => [V.normalizeHospitalName(g.name ?? ""), g]));

  const plano = [];
  const fora = [];
  for (const file of readdirSync(DIR).filter((f) => f.endsWith(".md")).sort()) {
    const { fm } = V.parseNote(readFileSync(join(DIR, file), "utf8"));
    if (fm.status !== "publicado") continue;
    const ghost = (typeof fm.ghost_id === "string" && byId.get(fm.ghost_id)) || byName.get(V.normalizeHospitalName(String(fm.hospital ?? ""))) || null;
    if (!ghost) {
      fora.push(`${file}: nenhum GHOST com esse id/nome`);
      continue;
    }
    const contato = H.ghostContactFromNote(fm);
    const data = {};
    const conflitos = [];
    for (const [k, col] of FIELDS) {
      const novo = contato[k];
      if (!novo) continue;
      const atual = ghost[col];
      if (!atual) data[col] = novo;
      else if (String(atual).trim().toLowerCase() !== String(novo).trim().toLowerCase()) conflitos.push(`${col}: GHOST "${atual}" × nota "${novo}"`);
    }
    if (Object.keys(data).length || conflitos.length || contato.problemas.length) {
      plano.push({ file, ghost: ghost.name, ghostId: ghost.id, data, conflitos, problemas: contato.problemas });
    }
  }

  const preencher = plano.filter((p) => Object.keys(p.data).length);
  console.log(`${APPLY ? "APLICANDO" : "DRY-RUN (nada gravado)"} — ${preencher.length} GHOST a preencher, ${plano.filter((p) => p.conflitos.length).length} com conflito, ${fora.length} nota(s) sem GHOST`);
  for (const p of plano) {
    const cols = Object.entries(p.data).map(([c, v]) => `${c}=${v}`).join(" ");
    console.log(`- ${p.ghost} (${p.file})${cols ? ` → ${cols}` : ""}`);
    for (const c of p.conflitos) console.log(`    conflito (não sobrescreve): ${c}`);
    for (const pr of p.problemas) console.log(`    fora: ${pr}`);
  }
  for (const f of fora) console.log(`- ${f}`);

  if (APPLY) {
    let n = 0;
    for (const p of preencher) {
      // Só colunas ainda vazias (o where repete a condição: corrida com edição manual).
      for (const [col, v] of Object.entries(p.data)) {
        const r = await db.user.updateMany({ where: { id: p.ghostId, role: "GHOST", [col]: null }, data: { [col]: v } });
        n += r.count;
      }
    }
    console.log(`gravadas ${n} coluna(s).`);
  } else {
    console.log("Para gravar: o dono confere a lista acima e roda com --apply.");
  }
} finally {
  await db.$disconnect();
}

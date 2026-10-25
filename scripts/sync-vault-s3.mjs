// Sobe as notas PUBLICADAS do vault (docs/operacao/) para o S3, em
// `operacao-vault/<caminho>.md`, + `operacao-vault/index.json` (manifesto que a
// ferramenta consultar_hospital lê). Decisão 5 do AI-First: sem tabela espelho,
// o CRM lê do S3. Plano: docs/ai-first/02-plano-etapa-2.md §6.
//
// Idempotente: compara o sha256 do arquivo local com o do index.json remoto e
// só sobe o que mudou (2ª rodada sem mudança = 0 uploads). Nunca apaga nada no
// S3 sem --prune. Não lê banco.
//
// Uso (credenciais AWS do .env):
//   node -r dotenv/config scripts/sync-vault-s3.mjs            # dry-run
//   node -r dotenv/config scripts/sync-vault-s3.mjs --apply [--prune]
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";

const SCRIPT = new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ROOT = join(dirname(SCRIPT), "..");
const VAULT = join(ROOT, "docs/operacao");
const PREFIX = "operacao-vault/";
const APPLY = process.argv.includes("--apply");
const PRUNE = process.argv.includes("--prune");

const require = createRequire(import.meta.url);
const jitiMod = require("jiti");
const createJiti = jitiMod.createJiti ?? jitiMod.default ?? jitiMod;
const jiti = createJiti(SCRIPT, { interopDefault: true, cache: false });
const V = await (typeof jiti.import === "function"
  ? jiti.import("../app/_shared/utils/vault.ts")
  : jiti("../app/_shared/utils/vault.ts"));

const Bucket = process.env.AWS_S3_BUCKET_NAME;
if (!Bucket || !process.env.AWS_REGION) {
  console.error("Faltam AWS_S3_BUCKET_NAME/AWS_REGION no ambiente (rode com -r dotenv/config).");
  process.exit(1);
}
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
});

// ---------------------------------------------------------------- local
const local = [];
const walk = (dir) => {
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, d.name);
    if (d.isDirectory()) walk(p);
    else if (d.name.endsWith(".md")) {
      const rel = relative(VAULT, p).replace(/\\/g, "/");
      if (!rel.includes("/") || rel.startsWith("_relatorios/")) continue;
      const text = readFileSync(p, "utf8");
      const { fm } = V.parseNote(text);
      if (fm.status !== "publicado") continue;
      const errs = V.checkNote(rel, text);
      if (errs.length) {
        console.warn(`! ${rel} publicado mas não passa no vault-check — não sobe: ${errs[0]}`);
        continue;
      }
      local.push({
        path: rel,
        titulo: V.noteTitle(rel, text),
        hospital: typeof fm.hospital === "string" ? fm.hospital : null,
        hospital_norm: typeof fm.hospital === "string" ? V.normalizeHospitalName(fm.hospital) : null,
        coluna: typeof fm.coluna === "string" ? fm.coluna : null,
        ghost_id: typeof fm.ghost_id === "string" ? fm.ghost_id : null,
        fonte: fm.fonte ?? null,
        fonte_hash: fm.fonte_hash ?? null,
        atualizado_em: fm.atualizado_em ?? null,
        sha256: V.sha256(text),
        text,
      });
    }
  }
};
if (existsSync(VAULT)) walk(VAULT);

// ---------------------------------------------------------------- remoto
let remoto = { notas: [] };
try {
  const r = await s3.send(new GetObjectCommand({ Bucket, Key: `${PREFIX}index.json` }));
  remoto = JSON.parse(await r.Body.transformToString("utf-8"));
} catch (e) {
  if (e?.name !== "NoSuchKey" && e?.$metadata?.httpStatusCode !== 404) throw e;
}
const remByPath = new Map((remoto.notas ?? []).map((n) => [n.path, n]));

// Lotes de publicação (_lotes/<id>.json, gerados pelo vault-publicar relatorio):
// a tela de conferência da amostra do Cérebro APP lê de operacao-vault/_lotes/.
const LOTES_DIR = join(VAULT, "_lotes");
const lotesLocais = existsSync(LOTES_DIR)
  ? readdirSync(LOTES_DIR)
      .filter((f) => /^[\w-]{1,60}\.json$/.test(f))
      .map((f) => {
        const text = readFileSync(join(LOTES_DIR, f), "utf8");
        const j = JSON.parse(text);
        return {
          resumo: {
            id: j.id,
            data: j.data,
            aprovadas: j.aprovadas.length,
            devolvidas: j.devolvidas.length,
            pendentes: j.pendentes.length,
            amostra: j.amostra.length,
            sha256: V.sha256(text),
          },
          file: f,
          text,
        };
      })
  : [];
const remLotes = new Map((remoto.lotes ?? []).map((l) => [l.id, l]));
const subirLotes = lotesLocais.filter((l) => remLotes.get(l.resumo.id)?.sha256 !== l.resumo.sha256);
const localPaths = new Set(local.map((n) => n.path));

const subir = local.filter((n) => remByPath.get(n.path)?.sha256 !== n.sha256);
const sobrando = [...remByPath.keys()].filter((p) => !localPaths.has(p));
const index = {
  geradoEm: new Date().toISOString(),
  notas: local
    .map((n) => {
      const meta = { ...n };
      delete meta.text;
      return meta;
    })
    .sort((a, b) => a.path.localeCompare(b.path)),
  lotes: [...new Map([...remLotes, ...lotesLocais.map((l) => [l.resumo.id, l.resumo])]).values()].sort((a, b) => a.id.localeCompare(b.id)),
};
// Sem --prune, nota que deixou de estar publicada continua no S3 e no índice.
if (!PRUNE) for (const p of sobrando) index.notas.push(remByPath.get(p));
index.notas.sort((a, b) => a.path.localeCompare(b.path));
const indexMudou =
  JSON.stringify((remoto.notas ?? []).map((n) => [n.path, n.sha256])) !== JSON.stringify(index.notas.map((n) => [n.path, n.sha256])) || subirLotes.length > 0;

console.log(`Publicadas no vault: ${local.length} · no S3: ${remByPath.size} · a subir: ${subir.length} · só no S3: ${sobrando.length}${PRUNE ? " (serão apagadas)" : ""} · index.json ${indexMudou ? "muda" : "igual"}`);
for (const n of subir) console.log(`  ↑ ${n.path}`);
for (const l of subirLotes) console.log(`  ↑ _lotes/${l.file}`);
if (PRUNE) for (const p of sobrando) console.log(`  ✗ ${p}`);
if (!APPLY) {
  console.log("Dry-run: nada enviado (use --apply).");
  process.exit(0);
}

for (const n of subir) {
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key: `${PREFIX}${n.path}`,
      Body: n.text,
      ContentType: "text/markdown; charset=utf-8",
      Metadata: { sha256: n.sha256 },
    }),
  );
}
for (const l of subirLotes) {
  await s3.send(
    new PutObjectCommand({ Bucket, Key: `${PREFIX}_lotes/${l.file}`, Body: l.text, ContentType: "application/json; charset=utf-8" }),
  );
}
if (PRUNE) for (const p of sobrando) await s3.send(new DeleteObjectCommand({ Bucket, Key: `${PREFIX}${p}` }));
if (indexMudou || subir.length) {
  await s3.send(
    new PutObjectCommand({
      Bucket,
      Key: `${PREFIX}index.json`,
      Body: JSON.stringify(index),
      ContentType: "application/json; charset=utf-8",
    }),
  );
}
console.log(`Enviado: ${subir.length} nota(s), ${subirLotes.length} lote(s)${PRUNE ? `, ${sobrando.length} apagada(s)` : ""}${indexMudou || subir.length ? " + index.json" : ""}.`);

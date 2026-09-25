// Diagnóstico das mídias do WhatsApp quebradas por rename e purga (auditoria de
// 24/09, DOC-1 e DOC-6). Até o PR01, renomear um anexo vindo da conversa copiava
// o objeto no S3 e APAGAVA a key que a mensagem usava, e a purga da lixeira
// apagava objeto ainda referenciado. Este script mede o estrago e monta o plano
// de reparo; a regra de categoria/ação é pura e testada em
// app/_shared/utils/media-repair.ts (carregada aqui via jiti).
//
// Uso (lê PRODUÇÃO: o .env aponta para o Neon e para o bucket de verdade):
//   node -r dotenv/config scripts/reparar-midias-renomeadas.mjs [--contact=<id>] [--incluir-ordem] [--out=<csv>]
//
// Hoje é SÓ dry-run: o banco é lido numa transação READ ONLY e o S3 só recebe
// leituras (GetBucketVersioning, HeadObject, ListObjectsV2, ListObjectVersions).
// O --apply (CopyObject da versão, UPDATE da mediaKey com guarda pelo valor
// antigo, soft-delete do reanexado) é o PR24, depois da revisão do CSV.
//
// O CSV sai fora do repo (os.tmpdir() por padrão) e CONTÉM DADO PESSOAL: a key
// renomeada carrega o nome digitado pela equipe (ex.: RG_Maria_Silva.jpeg).
// Apague o arquivo depois de revisar. O console só mostra contagens.

import "dotenv/config";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  S3Client,
  GetBucketVersioningCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
} from "@aws-sdk/client-s3";

const SCRIPT = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT), "..");

// ---------- argumentos ----------
const args = process.argv.slice(2);
const opt = { contact: null, out: null, includeOrder: false };
for (const a of args) {
  if (a === "--apply") {
    console.error("O --apply ainda não existe: ele entra no PR24, depois da revisão do CSV deste diagnóstico.");
    process.exit(2);
  } else if (a === "--incluir-ordem") opt.includeOrder = true;
  else if (a.startsWith("--contact=")) opt.contact = a.slice("--contact=".length).trim();
  else if (a.startsWith("--out=")) opt.out = a.slice("--out=".length).trim();
  else {
    console.error(`Argumento desconhecido: ${a}`);
    console.error("Uso: node -r dotenv/config scripts/reparar-midias-renomeadas.mjs [--contact=<id>] [--incluir-ordem] [--out=<csv>]");
    process.exit(2);
  }
}
if (opt.contact !== null && !/^[\w-]+$/.test(opt.contact)) {
  console.error("--contact precisa ser o id do WhatsAppContact.");
  process.exit(2);
}

const missingEnv = ["DATABASE_URL", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_S3_BUCKET_NAME"].filter(
  (k) => !process.env[k],
);
if (missingEnv.length) {
  console.error(`Faltam variáveis de ambiente: ${missingEnv.join(", ")} (rode com node -r dotenv/config).`);
  process.exit(2);
}

// O CSV tem nomes de cliente: nunca dentro do repo (iria parar num commit).
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outPath = path.resolve(opt.out || path.join(os.tmpdir(), `reparo-midias-${stamp}.csv`));
const relToRepo = path.relative(REPO_ROOT, outPath);
if (!relToRepo.startsWith("..") && !path.isAbsolute(relToRepo)) {
  console.error("O CSV contém dado pessoal e não pode ser gravado dentro do repositório. Use --out fora dele.");
  process.exit(2);
}

// ---------- lógica pura (TS) ----------
async function loadRepairLogic() {
  const require = createRequire(import.meta.url);
  let mod;
  try {
    // jiti já vem no node_modules (tailwindcss/vite); transpila o .ts na hora.
    mod = require("jiti");
  } catch {
    console.error("Não achei o pacote jiti no node_modules (rode npm install).");
    process.exit(1);
  }
  const create = mod.createJiti ?? mod.default ?? mod;
  const jiti = create(SCRIPT, { interopDefault: true, cache: false });
  const target = "../app/_shared/utils/media-repair.ts";
  return typeof jiti.import === "function" ? jiti.import(target) : jiti(target);
}
const { planMediaRepair, summarizeMediaRepair, mediaRepairCsv } = await loadRepairLogic();

// ---------- clientes ----------
const BUCKET = process.env.AWS_S3_BUCKET_NAME;
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});
const db = new PrismaClient();

const statusOf = (err) => err?.$metadata?.httpStatusCode ?? 0;
const PREFIX = opt.contact ? `whatsapp/${opt.contact}/` : "whatsapp/";

async function main() {
  console.log("Mídias do WhatsApp: DIAGNÓSTICO (dry-run, nada é alterado no banco nem no S3)");
  if (opt.contact) console.log(`Escopo: só o contato ${opt.contact}`);

  // ---------- 1) banco, tudo numa transação READ ONLY ----------
  const t0 = Date.now();
  const data = await db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const like = `${PREFIX}%`;
      // Sem ORDER BY/DISTINCT em whatsapp_messages (tabela grande): o
      // agrupamento é feito aqui no Node.
      const messages = opt.contact
        ? await tx.$queryRawUnsafe(
            `SELECT id, "contactId", "mediaKey", "createdAt" FROM whatsapp_messages
             WHERE "mediaKey" IS NOT NULL AND ("contactId" = $1 OR "mediaKey" LIKE $2)`,
            opt.contact,
            like,
          )
        : await tx.$queryRawUnsafe(
            `SELECT id, "contactId", "mediaKey", "createdAt" FROM whatsapp_messages WHERE "mediaKey" IS NOT NULL`,
          );
      const documents = await tx.$queryRawUnsafe(
        `SELECT id, key, "userId", COALESCE("createdAt", "uploadedAt") AS "createdAt", "deletedAt"
         FROM "Document" WHERE key LIKE $1`,
        like,
      );
      const flows = opt.contact ? [] : await tx.$queryRawUnsafe(`SELECT id, steps FROM whatsapp_flows`);
      const templates = opt.contact
        ? []
        : await tx.$queryRawUnsafe(
            `SELECT id, "headerMediaKey" FROM whatsapp_templates WHERE "headerMediaKey" IS NOT NULL`,
          );
      // Rastro da saída do Document: purga manual (document_purge) e exclusão
      // pela ficha (document_remove com key). A purga do cron não logava antes
      // do PR01, então "purgado" sem evidência também é possível.
      const logs = await tx.$queryRawUnsafe(
        `SELECT action, metadata->>'key' AS key FROM logs
         WHERE action IN ('document_purge', 'document_remove') AND metadata->>'key' LIKE $1`,
        like,
      );
      // Mídias mais recentes do sistema todo para o HEAD do preflight (as do
      // próprio contato podem estar todas quebradas, que é o que se investiga).
      const recent = await tx.$queryRawUnsafe(
        `SELECT "mediaKey" FROM whatsapp_messages WHERE "mediaKey" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 10`,
      );
      return { messages, documents, flows, templates, logs, recent };
    },
    { timeout: 120_000, maxWait: 20_000 },
  );

  const library = [];
  for (const f of data.flows) {
    const steps = Array.isArray(f.steps) ? f.steps : [];
    for (const s of steps) {
      if (s && typeof s.mediaKey === "string" && s.mediaKey) library.push({ origin: "fluxo", id: f.id, key: s.mediaKey });
    }
  }
  for (const t of data.templates) library.push({ origin: "template", id: t.id, key: t.headerMediaKey });

  const evidence = new Map();
  for (const l of data.logs) {
    if (!l.key) continue;
    // document_purge é a prova mais forte; não deixa document_remove sobrescrever.
    if (evidence.get(l.key) !== "document_purge") evidence.set(l.key, l.action);
  }

  const messages = data.messages.map((m) => ({ ...m, createdAt: new Date(m.createdAt) }));
  const documents = data.documents.map((d) => ({
    ...d,
    createdAt: new Date(d.createdAt),
    deletedAt: d.deletedAt ? new Date(d.deletedAt) : null,
  }));
  const msgKeyCount = new Set(messages.map((m) => m.mediaKey)).size;
  console.log(
    `Banco: ${messages.length} mensagens com mídia (${msgKeyCount} keys), ${documents.length} Documents em ${PREFIX}, ` +
      `${library.length} mídias de fluxo/template (${Date.now() - t0} ms)`,
  );

  // ---------- 2) preflight do S3 ----------
  const perms = { listBucket: "?", getBucketVersioning: "?", listBucketVersions: "n/a", getObjectVersion: "n/a" };
  let versioning = "desconhecido";
  try {
    const v = await s3.send(new GetBucketVersioningCommand({ Bucket: BUCKET }));
    versioning = v.Status ?? "nunca ativado";
    perms.getBucketVersioning = "ok";
  } catch (err) {
    perms.getBucketVersioning = statusOf(err) === 403 ? "negado" : `erro ${statusOf(err) || err?.name}`;
    console.warn(`Aviso: GetBucketVersioning falhou (${perms.getBucketVersioning}); sigo sem plano de restauração por versão.`);
  }

  // HEAD numa mediaKey recente tem que dar 200 (credencial lê objetos, região certa).
  let headOk = false;
  for (const m of data.recent) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: m.mediaKey }));
      headOk = true;
      break;
    } catch (err) {
      if (statusOf(err) === 403) {
        throw new Error("HEAD numa mídia recente deu 403: a credencial do .env não lê o bucket (s3:GetObject).");
      }
    }
  }
  if (data.recent.length && !headOk) {
    throw new Error("Nenhuma das 10 mídias mais recentes respondeu 200 no HEAD: confira AWS_REGION e AWS_S3_BUCKET_NAME.");
  }

  // Sem s3:ListBucket o S3 responde 403 (e não 404) para key inexistente, e
  // não dá para separar "sumiu" de "proibido": aí não há diagnóstico possível.
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: `whatsapp/__probe__/${randomUUID()}` }));
    throw new Error("A key de teste (probe) existe no bucket?! Abortando por segurança.");
  } catch (err) {
    const st = statusOf(err);
    if (st === 403) {
      throw new Error(
        "HEAD de key inexistente deu 403: a credencial não tem s3:ListBucket e não dá para distinguir 'sumiu' de 'proibido'.",
      );
    }
    if (st !== 404) throw err;
    perms.listBucket = "ok";
  }

  // ---------- 3) inventário do prefixo (ListObjectsV2 paginado) ----------
  const t1 = Date.now();
  const existing = new Set();
  let pages = 0;
  let token;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX, ContinuationToken: token, MaxKeys: 1000 }),
    );
    for (const o of res.Contents ?? []) if (o.Key) existing.add(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
    pages += 1;
  } while (token);
  console.log(`S3: ${existing.size} objetos em ${PREFIX} (${pages} páginas, ${Date.now() - t1} ms)`);

  // Keys referenciadas fora do prefixo listado (mensagem de contato mesclado,
  // fluxo com mídia em outra pasta): HEAD uma a uma. Na dúvida (403/erro),
  // conta como existente para não planejar reparo em cima de incerteza.
  const referenced = new Set([
    ...messages.map((m) => m.mediaKey),
    ...documents.map((d) => d.key),
    ...library.map((l) => l.key),
  ]);
  const outside = [...referenced].filter((k) => !k.startsWith(PREFIX));
  const outsideExisting = new Set();
  let outsideUnknown = 0;
  for (const key of outside) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
      outsideExisting.add(key);
    } catch (err) {
      if (statusOf(err) !== 404) {
        outsideUnknown += 1;
        outsideExisting.add(key);
      }
    }
  }
  if (outside.length) {
    console.log(`HEAD avulso: ${outside.length} keys fora de ${PREFIX} (${outsideUnknown} sem resposta clara, tratadas como existentes)`);
  }
  const exists = (key) => (key.startsWith(PREFIX) ? existing.has(key) : outsideExisting.has(key));
  const missing = new Set([...referenced].filter((k) => !exists(k)));

  // ---------- 4) versões (só com versionamento ativo ou suspenso) ----------
  const versions = new Map();
  let canRestoreVersion = false;
  if ((versioning === "Enabled" || versioning === "Suspended") && missing.size) {
    try {
      const newest = new Map();
      let keyMarker;
      let versionMarker;
      do {
        const res = await s3.send(
          new ListObjectVersionsCommand({
            Bucket: BUCKET,
            Prefix: PREFIX,
            KeyMarker: keyMarker,
            VersionIdMarker: versionMarker,
            MaxKeys: 1000,
          }),
        );
        for (const v of res.Versions ?? []) {
          if (!v.Key || !v.VersionId || !missing.has(v.Key)) continue;
          const cur = newest.get(v.Key);
          if (!cur || v.LastModified > cur.at) newest.set(v.Key, { id: v.VersionId, at: v.LastModified });
        }
        keyMarker = res.IsTruncated ? res.NextKeyMarker : undefined;
        versionMarker = res.IsTruncated ? res.NextVersionIdMarker : undefined;
      } while (keyMarker);
      for (const [k, v] of newest) versions.set(k, v.id);
      perms.listBucketVersions = "ok";
    } catch (err) {
      perms.listBucketVersions = statusOf(err) === 403 ? "negado" : `erro ${statusOf(err) || err?.name}`;
      console.warn(`Aviso: ListObjectVersions falhou (${perms.listBucketVersions}); sem plano de restauração por versão.`);
    }
    // Restaurar = CopyObject com ?versionId=, que exige s3:GetObjectVersion.
    const [probeKey, probeVersion] = versions.entries().next().value ?? [];
    if (probeKey) {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: probeKey, VersionId: probeVersion }));
        perms.getObjectVersion = "ok";
        canRestoreVersion = true;
      } catch (err) {
        perms.getObjectVersion = statusOf(err) === 403 ? "negado" : `erro ${statusOf(err) || err?.name}`;
      }
    }
  }

  // ---------- 5) plano ----------
  const rows = planMediaRepair({
    exists,
    messages,
    documents,
    library,
    versions,
    evidence,
    includeOrderPairs: opt.includeOrder,
    canRestoreVersion,
  });
  const sum = summarizeMediaRepair(rows);

  console.log("");
  console.log(`Bucket: versionamento = ${versioning}`);
  console.log(
    `Permissões: s3:ListBucket ${perms.listBucket} · s3:GetBucketVersioning ${perms.getBucketVersioning} · ` +
      `s3:ListBucketVersions ${perms.listBucketVersions} · s3:GetObjectVersion ${perms.getObjectVersion}`,
  );
  console.log(`Keys referenciadas que sumiram do bucket: ${missing.size} (${versions.size} com versão restaurável)`);
  console.log(`Linhas: ${rows.length} (${sum.mensagens} mensagens) · ${sum.contatos} contatos`);
  console.log("Por categoria:");
  for (const [k, n] of Object.entries(sum.porCategoria).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${n}`);
  console.log("Por ação:");
  for (const [k, n] of Object.entries(sum.porAcao).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(22)} ${n}`);
  console.log(
    `O --apply (PR24) agiria em ${sum.aplicaveis} linha(s)` +
      (opt.includeOrder ? " (incluindo pares por ordem)." : " (pares por ordem só com --incluir-ordem)."),
  );

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, mediaRepairCsv(rows), "utf8");
  console.log("");
  console.log(`CSV: ${outPath}`);
  console.log("ATENÇÃO: o CSV contém keys com nomes digitados pela equipe (dado pessoal). Apague depois de revisar.");
  console.log(
    "Resíduo sem reparo (purgado/ambiguo sem versão) só volta reenviando; na thread ele aparece como " +
      "'Arquivo indisponível' pelo fallback de UI (PR14).",
  );
}

try {
  await main();
} catch (err) {
  console.error(`\nERRO: ${err?.message ?? err}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

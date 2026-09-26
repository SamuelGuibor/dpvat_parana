// Diagnóstico e reparo das mídias do WhatsApp quebradas por rename e purga
// (auditoria de 24/09, DOC-1 e DOC-6). Até o PR01, renomear um anexo vindo da
// conversa copiava o objeto no S3 e APAGAVA a key que a mensagem usava, e a
// purga da lixeira apagava objeto ainda referenciado. Este script mede o estrago
// e monta o plano de reparo; a regra de categoria/ação, a leitura do CSV
// revisado e o rollback são puros e testados em app/_shared/utils/media-repair.ts
// (carregada aqui via jiti).
//
// Uso (PRODUÇÃO: o .env aponta para o Neon e para o bucket de verdade):
//   1) dry-run (padrão, só lê):
//      node -r dotenv/config scripts/reparar-midias-renomeadas.mjs [--contact=<id>] [--incluir-ordem] [--out=<csv>]
//   2) revisar o CSV; para tirar uma linha do reparo, troque "sim" por "nao"
//      na coluna "aplica" (ou apague a linha);
//   3) aplicar (ESCREVE no banco e no S3; só com aprovação explícita):
//      node -r dotenv/config scripts/reparar-midias-renomeadas.mjs --apply --plano=<csv revisado> [--contact=<id>] [--incluir-ordem] [--out=<csv resultado>]
//   4) rollback, se preciso (a partir do CSV de resultado do passo 3):
//      node -r dotenv/config scripts/reparar-midias-renomeadas.mjs --desfazer=<csv resultado> [--out=<csv>]
//
// O --apply recalcula o plano na hora e só escreve a linha que a revisão marcou
// "sim" E que o plano atual ainda traz idêntica e aplicável (selectReviewedRepairs).
// Escritas, todas com guarda e sem apagar nada:
//   - restaurar_versao: CopyObject da versão boa para a MESMA key (bucket versionado);
//   - apontar_para_doc / par_por_ordem: UPDATE da mediaKey WHERE id AND mediaKey = antiga;
//   - soft_delete_doc: Document reanexado quebrado vai para a lixeira (deletedBy
//     "reparo-midia"), só se a cópia renomeada segue ativa no mesmo card.
// Banco numa transação só (tudo ou nada). Pré-requisito: o PR01 (renomear não
// mexe no S3, purga preserva mídia em uso) no ar em produção; sem ele, a key
// volta a ser compartilhada e o próximo rename/purga apaga de novo.
//
// Os CSVs saem fora do repo (os.tmpdir() por padrão) e CONTÊM DADO PESSOAL: a
// key renomeada carrega o nome digitado pela equipe (ex.: RG_Maria_Silva.jpeg).
// Apague o do dry-run depois de revisar; guarde o de resultado só até conferir
// o reparo (é o arquivo do --desfazer). O console só mostra contagens.

import "dotenv/config";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  S3Client,
  CopyObjectCommand,
  GetBucketVersioningCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListObjectVersionsCommand,
} from "@aws-sdk/client-s3";

const SCRIPT = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT), "..");
const USAGE = [
  "Uso:",
  "  node -r dotenv/config scripts/reparar-midias-renomeadas.mjs [--contact=<id>] [--incluir-ordem] [--out=<csv>]",
  "  node -r dotenv/config scripts/reparar-midias-renomeadas.mjs --apply --plano=<csv revisado> [--contact=<id>] [--incluir-ordem] [--out=<csv>]",
  "  node -r dotenv/config scripts/reparar-midias-renomeadas.mjs --desfazer=<csv de resultado do --apply> [--out=<csv>]",
].join("\n");

// ---------- argumentos ----------
const args = process.argv.slice(2);
const opt = { contact: null, out: null, includeOrder: false, apply: false, plan: null, undo: null };
const fail = (msg) => {
  console.error(msg);
  console.error(USAGE);
  process.exit(2);
};
for (const a of args) {
  if (a === "--apply") opt.apply = true;
  else if (a === "--incluir-ordem") opt.includeOrder = true;
  else if (a.startsWith("--contact=")) opt.contact = a.slice("--contact=".length).trim();
  else if (a.startsWith("--out=")) opt.out = a.slice("--out=".length).trim();
  else if (a.startsWith("--plano=")) opt.plan = a.slice("--plano=".length).trim();
  else if (a.startsWith("--desfazer=")) opt.undo = a.slice("--desfazer=".length).trim();
  else fail(`Argumento desconhecido: ${a}`);
}
if (opt.contact !== null && !/^[\w-]+$/.test(opt.contact)) fail("--contact precisa ser o id do WhatsAppContact.");
// O --apply sem o CSV revisado escreveria o plano que ninguém revisou.
if (opt.apply && !opt.plan) fail("O --apply exige --plano=<CSV do dry-run, revisado>.");
if (opt.plan && !opt.apply) fail("--plano só vale junto com --apply.");
if (opt.undo !== null && (opt.apply || opt.contact || opt.includeOrder)) {
  fail("--desfazer roda sozinho (só aceita --out).");
}
if (opt.undo === "") fail("--desfazer precisa do caminho do CSV de resultado do --apply.");

const MODE = opt.undo !== null ? "desfazer" : opt.apply ? "apply" : "dry-run";
const needed = MODE === "desfazer"
  ? ["DATABASE_URL"]
  : ["DATABASE_URL", "AWS_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_S3_BUCKET_NAME"];
const missingEnv = needed.filter((k) => !process.env[k]);
if (missingEnv.length) {
  console.error(`Faltam variáveis de ambiente: ${missingEnv.join(", ")} (rode com node -r dotenv/config).`);
  process.exit(2);
}

// Os CSVs têm nomes de cliente: nunca dentro do repo (iriam parar num commit).
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const defaultName = { "dry-run": "reparo-midias", apply: "reparo-midias-aplicado", desfazer: "reparo-midias-desfeito" }[MODE];
const outPath = path.resolve(opt.out || path.join(os.tmpdir(), `${defaultName}-${stamp}.csv`));
const relToRepo = path.relative(REPO_ROOT, outPath);
if (!relToRepo.startsWith("..") && !path.isAbsolute(relToRepo)) {
  console.error("O CSV contém dado pessoal e não pode ser gravado dentro do repositório. Use --out fora dele.");
  process.exit(2);
}
const inputCsv = opt.plan ?? opt.undo;
if (inputCsv && path.resolve(inputCsv) === outPath) fail("--out não pode sobrescrever o CSV de entrada.");

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
const {
  planMediaRepair,
  summarizeMediaRepair,
  mediaRepairCsv,
  mediaRepairResultCsv,
  readMediaRepairCsv,
  selectReviewedRepairs,
  groupRepairWrites,
  planMediaRepairUndo,
  mediaRepairRowId,
  versionCopySource,
  MEDIA_REPAIR_DELETED_BY,
} = await loadRepairLogic();

function readCsvOrExit(file) {
  try {
    return readMediaRepairCsv(readFileSync(path.resolve(file), "utf8"));
  } catch (err) {
    console.error(`Não consegui ler ${file}: ${err?.message ?? err}`);
    process.exit(2);
  }
}
// Lido antes de tocar no banco/S3: CSV com coluna faltando ou valor fora do
// vocabulário para aqui, sem custo nenhum.
const inputRows = inputCsv ? readCsvOrExit(inputCsv) : null;

// ---------- clientes ----------
const BUCKET = process.env.AWS_S3_BUCKET_NAME;
const s3 =
  MODE === "desfazer"
    ? null
    : new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });
const db = new PrismaClient();

const statusOf = (err) => err?.$metadata?.httpStatusCode ?? 0;
const errLabel = (err) => String(statusOf(err) || err?.name || "erro");
// Mensagem de erro de uma linha só no CSV (o Prisma devolve texto multilinha).
const oneLine = (err) => String(err?.message ?? err).replace(/\s+/g, " ").slice(0, 300);
const PREFIX = opt.contact ? `whatsapp/${opt.contact}/` : "whatsapp/";
// Interativa com uma ida ao banco por linha: o prazo cresce com o lote.
const txTimeout = (n) => Math.min(600_000, 60_000 + n * 2_000);

function writeCsv(csv) {
  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, csv, "utf8");
}

function printCounts(title, rows, keyOf) {
  const counts = {};
  for (const r of rows) {
    const k = keyOf(r);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  console.log(title);
  for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(40)} ${n}`);
}

/** Lê banco + bucket e devolve o plano (é o dry-run; o --apply parte daqui). */
async function buildPlan() {
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
    perms.getBucketVersioning = statusOf(err) === 403 ? "negado" : `erro ${errLabel(err)}`;
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
      perms.listBucketVersions = statusOf(err) === 403 ? "negado" : `erro ${errLabel(err)}`;
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
        perms.getObjectVersion = statusOf(err) === 403 ? "negado" : `erro ${errLabel(err)}`;
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
  printCounts("Por categoria:", rows, (r) => r.categoria);
  printCounts("Por ação:", rows, (r) => r.acao);
  console.log(
    `Aplicáveis no plano atual: ${sum.aplicaveis} linha(s)` +
      (opt.includeOrder ? " (incluindo pares por ordem)." : " (pares por ordem só com --incluir-ordem)."),
  );
  return rows;
}

async function dryRun() {
  console.log("Mídias do WhatsApp: DIAGNÓSTICO (dry-run, nada é alterado no banco nem no S3)");
  if (opt.contact) console.log(`Escopo: só o contato ${opt.contact}`);
  const rows = await buildPlan();
  writeCsv(mediaRepairCsv(rows));
  console.log("");
  console.log(`CSV: ${outPath}`);
  console.log("ATENÇÃO: o CSV contém keys com nomes digitados pela equipe (dado pessoal). Apague depois de revisar.");
  console.log(
    'Para aplicar: revise o CSV ("nao" na coluna aplica tira a linha) e rode com --apply --plano=<este CSV>' +
      (opt.includeOrder ? " --incluir-ordem" : "") +
      " (escreve em produção: só com aprovação).",
  );
  console.log(
    "Resíduo sem reparo (purgado/ambiguo sem versão) só volta reenviando; na thread ele aparece como " +
      "'Arquivo indisponível' pelo fallback de UI (PR14).",
  );
}

async function apply() {
  console.log("Mídias do WhatsApp: REPARO (--apply) — ESCREVE no banco e no S3 de PRODUÇÃO");
  console.log("Pré-requisito: o PR01 (renomear não mexe no S3; purga preserva mídia em uso) no ar em produção.");
  if (opt.contact) console.log(`Escopo: só o contato ${opt.contact}`);
  const reviewed = inputRows;
  console.log(`CSV revisado: ${reviewed.length} linhas, ${reviewed.filter((r) => r.aplica).length} marcadas "sim"`);
  console.log("");

  const fresh = await buildPlan();
  const sel = selectReviewedRepairs(fresh, reviewed, {
    inScope: opt.contact ? (r) => r.contactId === opt.contact : undefined,
  });
  console.log("");
  console.log(
    `Cruzamento com a revisão: ${sel.aprovadas.length} aprovadas e ainda válidas · ${sel.puladas.length} puladas · ` +
      `${sel.recusadas} recusadas na revisão · ${sel.naoRevisadas} aplicáveis que não estavam no CSV (não entram)`,
  );
  if (sel.naoRevisadas) {
    console.log(
      "  Linhas aplicáveis fora do CSV revisado (caso novo desde a revisão ou CSV de outro --contact) não entram; " +
        "para incluí-las, rode o dry-run de novo e revise.",
    );
  }

  const writes = groupRepairWrites(sel.aprovadas);
  const byRow = new Map();
  const set = (r, resultado, detalhe = "") => byRow.set(mediaRepairRowId(r), { resultado, detalhe });

  // ---------- A) restaurar versões (S3; independe do banco) ----------
  const restoreResult = new Map();
  for (const { key, versionId } of writes.restaurar) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
      restoreResult.set(key, { resultado: "pulado", detalhe: "a key já existe no bucket (nada a restaurar)" });
      continue;
    } catch (err) {
      if (statusOf(err) !== 404) {
        restoreResult.set(key, { resultado: "erro", detalhe: `HEAD da key antes de restaurar: ${errLabel(err)}` });
        process.exitCode = 1;
        continue;
      }
    }
    try {
      await s3.send(
        new CopyObjectCommand({ Bucket: BUCKET, Key: key, CopySource: versionCopySource(BUCKET, key, versionId) }),
      );
      restoreResult.set(key, { resultado: "aplicado", detalhe: "" });
    } catch (err) {
      restoreResult.set(key, { resultado: "erro", detalhe: `CopyObject da versão: ${errLabel(err)}` });
      process.exitCode = 1;
    }
  }

  // ---------- B) a cópia renomeada ainda está no bucket? ----------
  // O plano já veio da listagem de segundos atrás; o HEAD fecha a janela entre
  // a listagem e o UPDATE (apontar para objeto que sumiu quebraria de novo).
  const badNewKey = new Map();
  const newKeys = new Set([...writes.mensagens, ...writes.documentos].map((r) => r.newKey));
  for (const key of newKeys) {
    try {
      await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    } catch (err) {
      badNewKey.set(key, `a cópia renomeada não respondeu no HEAD (${errLabel(err)})`);
    }
  }
  const msgs = writes.mensagens.filter((r) => !badNewKey.has(r.newKey));
  const docs = writes.documentos.filter((r) => !badNewKey.has(r.newKey));

  // ---------- C) banco: uma transação, tudo ou nada ----------
  if (msgs.length || docs.length) {
    try {
      await db.$transaction(
        async (tx) => {
          for (const r of msgs) {
            // Guarda pelo valor antigo: se a mensagem mudou desde o plano, não mexe.
            const { count } = await tx.whatsAppMessage.updateMany({
              where: { id: r.id, mediaKey: r.oldKey },
              data: { mediaKey: r.newKey },
            });
            if (count) set(r, "aplicado");
            else set(r, "pulado", "a mediaKey mudou desde o plano (guarda pelo valor antigo)");
          }
          for (const r of docs) {
            // A cópia renomeada tem que seguir ativa, com a mesma key, no mesmo
            // card do reanexado: é ela que fica no lugar dele.
            const keep = await tx.document.findFirst({
              where: { id: r.docId, key: r.newKey, deletedAt: null },
              select: { userId: true },
            });
            if (!keep) {
              set(r, "pulado", "a cópia renomeada saiu do card ou foi para a lixeira");
              continue;
            }
            const { count } = await tx.document.updateMany({
              where: { id: r.id, key: r.oldKey, deletedAt: null, userId: keep.userId },
              data: { deletedAt: new Date(), deletedBy: MEDIA_REPAIR_DELETED_BY },
            });
            if (count) set(r, "aplicado");
            else set(r, "pulado", "o Document mudou desde o plano (já na lixeira, outra key ou outro card)");
          }
        },
        { maxWait: 20_000, timeout: txTimeout(msgs.length + docs.length * 2) },
      );
    } catch (err) {
      for (const r of [...msgs, ...docs]) set(r, "erro", `transação desfeita, nada gravado no banco: ${oneLine(err)}`);
      process.exitCode = 1;
    }
  }

  // ---------- D) resultado ----------
  const out = [];
  for (const r of sel.aprovadas) {
    const res =
      r.acao === "restaurar_versao"
        ? restoreResult.get(r.oldKey)
        : badNewKey.has(r.newKey)
          ? { resultado: "pulado", detalhe: badNewKey.get(r.newKey) }
          : byRow.get(mediaRepairRowId(r));
    out.push({ ...r, ...(res ?? { resultado: "erro", detalhe: "sem resultado" }) });
  }
  for (const p of sel.puladas) out.push({ ...p.row, resultado: "pulado", detalhe: p.motivo });

  writeCsv(mediaRepairResultCsv(out));
  console.log("");
  printCounts("Resultado:", out, (r) => `${r.resultado} · ${r.acao}`);
  console.log("");
  console.log(`CSV de resultado: ${outPath}`);
  console.log("Ele é o rollback (--desfazer=<este CSV>) e contém dado pessoal: guarde só até conferir o reparo e apague.");
  if (process.exitCode) console.log("Houve erro: veja a coluna 'detalhe' das linhas com resultado 'erro'.");
}

async function undo() {
  console.log("Mídias do WhatsApp: DESFAZER o reparo — ESCREVE no banco de PRODUÇÃO");
  const plan = planMediaRepairUndo(inputRows);
  console.log(
    `CSV de resultado: ${inputRows.length} linhas · ${plan.mensagens.length} mensagens e ${plan.documentos.length} ` +
      `Documents para voltar · ${plan.semDesfazer} restaurações de versão (não se desfazem: só trouxeram o objeto de volta)`,
  );
  const results = new Map();
  const set = (r, resultado, detalhe = "") => results.set(mediaRepairRowId(r), { resultado, detalhe });
  const all = [...plan.mensagens, ...plan.documentos];
  if (all.length) {
    try {
      await db.$transaction(
        async (tx) => {
          for (const r of plan.mensagens) {
            // Só volta se ainda aponta para a cópia (ninguém mexeu depois do reparo).
            const { count } = await tx.whatsAppMessage.updateMany({
              where: { id: r.id, mediaKey: r.newKey },
              data: { mediaKey: r.oldKey },
            });
            if (count) set(r, "desfeito");
            else set(r, "pulado", "a mediaKey mudou depois do reparo");
          }
          for (const r of plan.documentos) {
            const { count } = await tx.document.updateMany({
              where: { id: r.id, key: r.oldKey, deletedBy: MEDIA_REPAIR_DELETED_BY, deletedAt: { not: null } },
              data: { deletedAt: null, deletedBy: null },
            });
            if (count) set(r, "desfeito");
            else set(r, "pulado", "o Document já saiu da lixeira, foi purgado ou mudou");
          }
        },
        { maxWait: 20_000, timeout: txTimeout(all.length) },
      );
    } catch (err) {
      for (const r of all) set(r, "erro", `transação desfeita, nada gravado no banco: ${oneLine(err)}`);
      process.exitCode = 1;
    }
  }
  const out = all.map((r) => ({ ...r, ...(results.get(mediaRepairRowId(r)) ?? { resultado: "erro", detalhe: "sem resultado" }) }));
  writeCsv(mediaRepairResultCsv(out));
  printCounts("Resultado:", out, (r) => `${r.resultado} · ${r.acao}`);
  console.log(`CSV: ${outPath} (contém dado pessoal: apague depois de conferir)`);
}

try {
  if (MODE === "desfazer") await undo();
  else if (MODE === "apply") await apply();
  else await dryRun();
} catch (err) {
  console.error(`\nERRO: ${err?.message ?? err}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

// Retenção da Operação por IA (decisão 18 do dono, 26/10): 3 meses no banco;
// o mais antigo vai para um backup no S3, consultável lá
// (scripts/op-backup-ler.mjs). Tabelas: op_tool_calls, op_approvals
// (encerradas), op_workflows (concluídos/abandonados) e op_requests.
// Logs `move` e histórico do card NÃO entram (nunca são purgados).
//
// Uso (PRODUÇÃO: o .env aponta para o Neon):
//   node -r dotenv/config scripts/op-backup-retencao.mjs            # dry-run READ ONLY: o que sairia
//   node -r dotenv/config scripts/op-backup-retencao.mjs --dias=120 # corte diferente (mínimo 90)
//   node -r dotenv/config scripts/op-backup-retencao.mjs --apply    # exporta, CONFERE e só então apaga
//
// --apply é do dono. Por tabela: lê as linhas (lotes de 2.000), grava
// operacao-backup/<AAAA>-T<n>/<tabela>-<carimbo>.jsonl.gz, baixa de volta,
// confere contagem + sha256 e SÓ ENTÃO apaga exatamente os ids exportados.
// Falha em qualquer conferência = nada apagado daquela tabela (e para).
// Ordem: op_tool_calls → op_approvals → op_workflows → op_requests (prompt
// com ferramenta ou aprovação ainda no banco fica: não quebra a auditoria).
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const APPLY = args.apply === true;
const DIAS = Math.max(90, Number(args.dias ?? 90));
const corte = new Date(Date.now() - DIAS * 86_400_000);
const LOTE = 2_000;
const PREFIX = "operacao-backup/";

// Trimestre de Brasília do corte (a pasta do backup).
const brParts = (d) => Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((p) => [p.type, p.value]));
const b = brParts(new Date());
const pasta = `${PREFIX}${b.year}-T${Math.floor((Number(b.month) - 1) / 3) + 1}/`;
const carimbo = `${b.year}${b.month}${b.day}-${b.hour}${b.minute}`;
const fmt = (d) => (d ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(d) : "—");

/** Cada tabela: filtro do que sai (sempre antes do corte) e o model do Prisma. */
const TABELAS = [
  { nome: "op_tool_calls", model: "opToolCall", where: { createdAt: { lt: corte } } },
  // Aprovação pendente/enviando nunca sai (pendente vence em 30 min; enviando = conferir antes).
  { nome: "op_approvals", model: "opApproval", where: { createdAt: { lt: corte }, status: { notIn: ["pendente", "enviando"] } } },
  { nome: "op_workflows", model: "opWorkflow", where: { updatedAt: { lt: corte }, status: { in: ["concluido", "abandonado"] } } },
  {
    nome: "op_requests",
    model: "opRequest",
    // Fica no banco: prompt que ainda tem ferramenta ou aprovação ligada (as do
    // período), ou que é origem de fluxo aberto.
    where: { createdAt: { lt: corte }, toolCalls: { none: {} } },
    extra: async (db, ids) => {
      const presos = new Set([
        ...(await db.opApproval.findMany({ where: { approvedRequestId: { in: ids } }, select: { approvedRequestId: true } })).map((r) => r.approvedRequestId),
        ...(await db.opWorkflow.findMany({ where: { originRequestId: { in: ids }, status: { in: ["em_andamento", "bloqueado"] } }, select: { originRequestId: true } })).map((r) => r.originRequestId),
      ]);
      return ids.filter((id) => !presos.has(id));
    },
  },
];

const db = new PrismaClient();

async function contar() {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    const out = [];
    for (const t of TABELAS) {
      const total = await tx[t.model].count({ where: t.where });
      const maisAntigo = total ? await tx[t.model].findFirst({ where: t.where, orderBy: { createdAt: "asc" }, select: { createdAt: true } }) : null;
      out.push({ ...t, total, maisAntigo: maisAntigo?.createdAt ?? null });
    }
    return out;
  });
}

function s3Client() {
  if (!process.env.AWS_S3_BUCKET_NAME || !process.env.AWS_REGION) throw new Error("AWS_S3_BUCKET_NAME/AWS_REGION ausentes no ambiente.");
  return new S3Client({
    region: process.env.AWS_REGION,
    credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
  });
}

async function exportarEApagar(s3, t) {
  const Bucket = process.env.AWS_S3_BUCKET_NAME;
  const linhas = [];
  let cursor = null;
  for (;;) {
    const lote = await db[t.model].findMany({ where: t.where, orderBy: { id: "asc" }, take: LOTE, ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}) });
    if (!lote.length) break;
    linhas.push(...lote);
    cursor = lote.at(-1).id;
  }
  let ids = linhas.map((r) => r.id);
  if (t.extra) ids = await t.extra(db, ids);
  const keep = new Set(ids);
  const exportar = linhas.filter((r) => keep.has(r.id));
  if (!exportar.length) return { tabela: t.nome, exportadas: 0, apagadas: 0 };

  const corpo = gzipSync(Buffer.from(exportar.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8"));
  const sha = createHash("sha256").update(corpo).digest("hex");
  const Key = `${pasta}${t.nome}-${carimbo}.jsonl.gz`;
  await s3.send(new PutObjectCommand({ Bucket, Key, Body: corpo, ContentType: "application/gzip", Metadata: { linhas: String(exportar.length), sha256: sha, corte: corte.toISOString() } }));

  // Conferência: baixa de volta, mesmo sha256 e mesma contagem de linhas.
  const volta = Buffer.from(await (await s3.send(new GetObjectCommand({ Bucket, Key }))).Body.transformToByteArray());
  const shaVolta = createHash("sha256").update(volta).digest("hex");
  const linhasVolta = gunzipSync(volta).toString("utf8").split("\n").filter(Boolean);
  const idsVolta = new Set(linhasVolta.map((l) => JSON.parse(l).id));
  if (shaVolta !== sha || linhasVolta.length !== exportar.length || exportar.some((r) => !idsVolta.has(r.id))) {
    throw new Error(`${t.nome}: conferência do backup falhou (${Key}). NADA apagado desta tabela.`);
  }

  let apagadas = 0;
  for (let i = 0; i < exportar.length; i += 500) {
    const fatia = exportar.slice(i, i + 500).map((r) => r.id);
    apagadas += (await db[t.model].deleteMany({ where: { id: { in: fatia } } })).count;
  }
  return { tabela: t.nome, exportadas: exportar.length, apagadas, key: Key, sha256: sha };
}

try {
  const resumo = await contar();
  console.log(`\n== Retenção da Operação por IA — corte: antes de ${fmt(corte)} (${DIAS} dias) ==\n`);
  for (const r of resumo) console.log(`  ${r.nome.padEnd(14)} ${String(r.total).padStart(7)} linha(s)  · mais antiga: ${fmt(r.maisAntigo)}`);
  console.log(`\nDestino: s3://<bucket>/${pasta}<tabela>-${carimbo}.jsonl.gz`);
  console.log("op_requests: a contagem é dos prompts SEM ferramenta hoje; no --apply as op_tool_calls antigas saem antes, então sai mais. Ficam os com aprovação ligada ou origem de fluxo aberto.");

  if (!APPLY) {
    console.log("\nDry-run (READ ONLY): nada exportado nem apagado. Para fazer: acrescente --apply.\n");
  } else {
    const s3 = s3Client();
    for (const t of TABELAS) {
      const r = await exportarEApagar(s3, t);
      console.log(`  ✔ ${r.tabela}: ${r.exportadas} exportada(s), ${r.apagadas} apagada(s)${r.key ? ` → ${r.key}` : ""}`);
      if (r.exportadas !== r.apagadas) console.log(`    ⚠ diferença: alguma linha sumiu entre exportar e apagar (outra rotina?). O backup tem todas.`);
    }
    console.log("\nFeito. Consulte com scripts/op-backup-ler.mjs.\n");
  }
} catch (err) {
  console.error(`erro: ${err.message}`);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

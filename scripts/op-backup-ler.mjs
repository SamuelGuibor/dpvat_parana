// Consulta o backup da Operação por IA no S3 (operacao-backup/, gravado pelo
// scripts/op-backup-retencao.mjs --apply). Só leitura: lista e baixa.
//
// Uso:
//   node -r dotenv/config scripts/op-backup-ler.mjs                          # lista os arquivos (pasta por trimestre)
//   node -r dotenv/config scripts/op-backup-ler.mjs --trimestre=2026-T4      # só um trimestre
//   node -r dotenv/config scripts/op-backup-ler.mjs --baixar=<key> --saida=<pasta>   # baixa e descompacta (.jsonl)
//   ... --baixar=<key> --buscar=<texto>                                      # imprime só as linhas que contêm o texto
//
// O backup tem dado pessoal (texto dos prompts, CPF/telefone nos args): baixe
// só para a auditoria que precisa e apague a cópia local depois.
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import { gunzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);
const PREFIX = "operacao-backup/";
const Bucket = process.env.AWS_S3_BUCKET_NAME;
if (!Bucket || !process.env.AWS_REGION) {
  console.error("erro: AWS_S3_BUCKET_NAME/AWS_REGION ausentes no ambiente.");
  process.exit(1);
}
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY },
});

if (typeof args.baixar === "string") {
  const Key = args.baixar;
  if (!Key.startsWith(PREFIX)) {
    console.error(`erro: só arquivos de ${PREFIX}.`);
    process.exit(1);
  }
  const corpo = Buffer.from(await (await s3.send(new GetObjectCommand({ Bucket, Key }))).Body.transformToByteArray());
  const texto = gunzipSync(corpo).toString("utf8");
  if (typeof args.buscar === "string") {
    for (const l of texto.split("\n")) if (l.includes(args.buscar)) console.log(l);
  } else {
    const dir = typeof args.saida === "string" ? args.saida : ".";
    mkdirSync(dir, { recursive: true });
    const out = join(dir, basename(Key).replace(/\.gz$/, ""));
    writeFileSync(out, texto);
    console.log(`baixado: ${out} (${texto.split("\n").filter(Boolean).length} linha(s))`);
  }
} else {
  const Prefix = typeof args.trimestre === "string" ? `${PREFIX}${args.trimestre}/` : PREFIX;
  let token;
  let n = 0;
  do {
    const r = await s3.send(new ListObjectsV2Command({ Bucket, Prefix, ContinuationToken: token }));
    for (const o of r.Contents ?? []) {
      n++;
      console.log(`${o.Key}  ${Math.round((o.Size ?? 0) / 1024)} KB  ${o.LastModified?.toISOString() ?? ""}`);
    }
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  if (!n) console.log(`nada em ${Prefix}`);
}

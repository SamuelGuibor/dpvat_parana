// Migra o conteúdo dos modelos .docx que ainda vivem só no disco (templates/
// e templates-assinatura/) pro banco (doc_templates.s3Key aponta pro S3).
// Depois disso o match de "qual modelo é esse" passa a ser 100% pelo banco —
// ver o comentário no topo de app/_shared/lib/doc-templates.ts.
//
// Idempotente: pula qualquer filename que já tenha s3Key na tabela.
//
//   node -r dotenv/config scripts/migrate-templates-to-db.mjs

import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const db = new PrismaClient();
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Mesma ordem/metadados de app/_shared/lib/doc-templates.ts (BUILTIN_SIGNATURE_TEMPLATES).
const SIGNATURE_FILES = [
  { file: "KIT_PREV_CSS_ASSINATURA.docx", label: "KIT previdenciário — procuração e contrato" },
  { file: "PROCURAÇÃO-ESPECÍFICA_CURITIBA_ASSINATURA.docx", label: "Procuração específica — Curitiba" },
  { file: "-PROCURAÇÃO-ESPECÍFICA-TAYNARA_ASSINATURA.docx", label: "Procuração específica — Dra. Taynara" },
  { file: "DECLARACAO_DE_HIPOSSUFICIENCIA_ASSINATURA.docx", label: "Declaração de hipossuficiência" },
];

async function migrateOne(dir, kind, filename, label, sortOrder) {
  const existing = await db.docTemplate.findUnique({ where: { filename } });
  if (existing?.s3Key) {
    console.log(`— ${filename}: já está no banco, pulando`);
    return;
  }

  const filePath = path.join(dir, filename);
  if (!fs.existsSync(filePath)) {
    console.log(`— ${filename}: não existe em ${dir}/, pulando`);
    return;
  }

  const body = fs.readFileSync(filePath);
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `doc-templates/${kind}/migrated-${Date.now()}-${safe}`;
  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: DOCX_MIME,
  }));

  await db.docTemplate.upsert({
    where: { filename },
    create: { filename, label: existing?.label ?? label ?? null, s3Key: key, kind, hidden: false, sortOrder },
    update: { s3Key: key, hidden: false, sortOrder, ...(existing?.label ? {} : { label: label ?? null }) },
  });
  console.log(`✔ ${filename} → ${key}`);
}

async function main() {
  console.log("Assinatura (templates-assinatura/):");
  for (let i = 0; i < SIGNATURE_FILES.length; i++) {
    const { file, label } = SIGNATURE_FILES[i];
    await migrateOne("templates-assinatura", "assinatura", file, label, i);
  }

  console.log("\nProcuração (templates/):");
  const procDir = "templates";
  const procFiles = fs
    .readdirSync(procDir)
    .filter((f) => f.endsWith(".docx") && !f.toUpperCase().includes("ASSINATURA"));
  for (const file of procFiles) {
    await migrateOne(procDir, "procuracao", file, null, 0);
  }

  console.log("\nMigração concluída.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());

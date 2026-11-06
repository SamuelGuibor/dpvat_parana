// Troca de marca: dados de produção que não vivem no código.
// Uso:  node scripts/marca-brasil-beneficios-producao.mjs           (dry-run: só mostra)
//       node scripts/marca-brasil-beneficios-producao.mjs --apply   (grava)
//
// O que faz:
//  1. Instruções do bot: cria a versão nova com o nome trocado e publica (banco + S3
//     que o cérebro lê), nos mesmos passos de publishInstructions.
//  2. Fluxos do WhatsApp: troca o nome e a senha padrão no texto das mensagens.
//  3. Rótulos das linhas do WhatsApp.
//  4. Modelos .docx no S3 (os vivos; templates/ é só fallback): troca logo e arroba,
//     guardando cópia do original em doc-templates/backup-troca-marca/.
//
// Templates da Meta ficam de fora: alteração volta para análise e precisa de um
// lote acompanhado (as duas WABAs já levaram aviso de spam).
import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { S3Client, GetObjectCommand, PutObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import PizZip from "pizzip";

const APPLY = process.argv.includes("--apply");
const BRAND = "Brasil Benefícios e Indenizações";
const db = new PrismaClient();
const trocarNome = (s) => s.replaceAll("Paraná Seguros", BRAND).replaceAll("Seguros Paraná", BRAND);
const trocarFluxo = (s) => trocarNome(s).replaceAll("segurosparana1", "brasilbeneficios1");

// Cópia de renderInstructions (instructions.ts): este script roda fora do Next.
const renderizar = (intro, secoes) => {
  const RULE = "═".repeat(39);
  const body = [...secoes]
    .filter((s) => s.enabled)
    .sort((a, b) => a.order - b.order)
    .map((s) => `${RULE}\n${s.title}\n${RULE}\n\n${s.content}`)
    .join("\n\n");
  return `${intro}\n\n${body}\n`;
};

console.log(APPLY ? "=== APLICANDO ===" : "=== DRY-RUN (nada será gravado) ===");

// 1. Instruções do bot -----------------------------------------------------
const pub = await db.whatsAppInstructions.findFirst({ where: { status: "publicado" }, orderBy: { version: "desc" } });
if (!pub) throw new Error("Não há versão publicada das instruções: nada foi gravado.");

// Fluxos e rótulos são sobrescritos no lugar: guarda o original antes de qualquer gravação.
if (APPLY) {
  const copia = {
    flows: await db.whatsAppFlow.findMany({ select: { id: true, name: true, steps: true } }),
    numeros: await db.whatsAppNumber.findMany({ select: { id: true, label: true } }),
  };
  const arquivo = path.join(os.tmpdir(), `backup-troca-marca-${Date.now()}.json`);
  fs.writeFileSync(arquivo, JSON.stringify(copia, null, 2));
  console.log(`Cópia de fluxos e rótulos: ${arquivo}`);
}

const rascunho = await db.whatsAppInstructions.findFirst({ where: { status: "rascunho" } });
const sections = pub.sections.map((s) => ({ ...s, title: trocarNome(s.title), content: trocarNome(s.content) }));
const mudaram = sections.filter((s, i) => s.content !== pub.sections[i].content || s.title !== pub.sections[i].title);
console.log(`\n# Instruções: publicada v${pub.version}, ${mudaram.length} seção(ões) mudam: ${mudaram.map((s) => s.title).join(" | ")}`);
if (rascunho) {
  console.log(`  !! já existe rascunho v${rascunho.version}: não sobrescrevo. Publique ou descarte e rode de novo.`);
} else if (APPLY) {
  const last = await db.whatsAppInstructions.findFirst({ orderBy: { version: "desc" }, select: { version: true } });
  const intro = trocarNome(pub.intro);
  const rendered = renderizar(intro, sections);
  const novo = await db.whatsAppInstructions.create({
    data: { version: last.version + 1, intro, sections, status: "rascunho", charCount: rendered.length, changeNote: "Troca de marca para Brasil Benefícios e Indenizações" },
  });
  const payload = JSON.stringify({ version: novo.version, generatedAt: new Date().toISOString(), intro, sections, rendered }, null, 2);
  const s3Instr = new S3Client({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } });
  for (const Key of ["whatsapp-brain/instructions/current.json", `whatsapp-brain/instructions/v${novo.version}.json`]) {
    await s3Instr.send(new PutObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key, Body: payload, ContentType: "application/json" }));
  }
  await db.whatsAppInstructions.updateMany({ where: { status: "publicado" }, data: { status: "descartado" } });
  await db.whatsAppInstructions.update({ where: { id: novo.id }, data: { status: "publicado", publishedAt: new Date(), publishedBy: "Troca de marca (script)" } });
  console.log(`  v${novo.version} publicada (${rendered.length} caracteres).`);
}

// 2. Fluxos ----------------------------------------------------------------
console.log("\n# Fluxos");
for (const f of await db.whatsAppFlow.findMany()) {
  const steps = f.steps.map((s) => (typeof s.body === "string" ? { ...s, body: trocarFluxo(s.body) } : s));
  const alterados = steps.filter((s, i) => s.body !== f.steps[i].body);
  if (!alterados.length) continue;
  console.log(`- ${f.name}: ${alterados.length} mensagem(ns)`);
  for (const s of alterados) console.log(`    ${s.body.replace(/\s+/g, " ").slice(0, 150)}`);
  if (APPLY) await db.whatsAppFlow.update({ where: { id: f.id }, data: { steps } });
}

// 3. Linhas do WhatsApp ----------------------------------------------------
console.log("\n# Linhas");
const rotulos = { "Seguros Paraná IA": "Brasil Benefícios IA", "2 Seguros Paraná IA": "2 Brasil Benefícios IA", "Paraná DPVAT BOT": "Brasil Benefícios DPVAT BOT" };
for (const n of await db.whatsAppNumber.findMany({ select: { id: true, label: true } })) {
  const novo = rotulos[n.label];
  console.log(`- ${n.label} -> ${novo ?? "(sem mudança)"}`);
  if (novo && APPLY) await db.whatsAppNumber.update({ where: { id: n.id }, data: { label: novo } });
}

// 4. Modelos .docx no S3 ---------------------------------------------------
// Imagem nova vem do .docx já atualizado no repositório; `tamanhoOriginal` confere
// que o S3 ainda tem a imagem antiga antes de trocar.
const MODELOS = {
  "-PROCURAÇÃO-ESPECÍFICA_CURITIBA.docx": { repo: "templates/-PROCURAÇÃO-ESPECÍFICA_CURITIBA.docx", midia: "word/media/image1.jpg", tamanhoOriginal: 18673 },
  "PROCURAÇÃO-ESPECÍFICA_CURITIBA_ASSINATURA.docx": { repo: "templates-assinatura/PROCURAÇÃO-ESPECÍFICA_CURITIBA_ASSINATURA.docx", midia: "word/media/image1.jpg", tamanhoOriginal: 18673 },
  "-PROCURAÇÃO-ESPECÍFICA-TAYNARA.docx": { repo: "templates/-PROCURAÇÃO-ESPECÍFICA-TAYNARA.docx", midia: "word/media/image2.png", tamanhoOriginal: 39146 },
  "-PROCURAÇÃO-ESPECÍFICA-TAYNARA_ASSINATURA.docx": { repo: "templates-assinatura/-PROCURAÇÃO-ESPECÍFICA-TAYNARA_ASSINATURA.docx", midia: "word/media/image2.png", tamanhoOriginal: 39146 },
  "PEDIDO_HOSPITALAR.docx": { repo: "templates/PEDIDO_HOSPITALAR.docx", midia: "word/media/image1.png", tamanhoOriginal: 67050 },
};
console.log("\n# Modelos no S3");
const s3 = new S3Client({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY } });
const Bucket = process.env.AWS_S3_BUCKET_NAME;
for (const d of await db.docTemplate.findMany({ where: { filename: { in: Object.keys(MODELOS) } } })) {
  const m = MODELOS[d.filename];
  if (!d.s3Key) {
    console.log(`- ${d.filename}: sem s3Key, PULADO`);
    continue;
  }
  const r = await s3.send(new GetObjectCommand({ Bucket, Key: d.s3Key }));
  const zip = new PizZip(Buffer.from(await r.Body.transformToByteArray()));
  const atual = zip.file(m.midia)?.asNodeBuffer();
  // Folga pequena: o Word regrava o JPEG com alguns bytes de diferença ao salvar.
  if (!atual || Math.abs(atual.length - m.tamanhoOriginal) > 50) {
    console.log(`- ${d.filename}: imagem no S3 não é a esperada (${atual?.length ?? "ausente"} bytes), PULADO`);
    continue;
  }
  const xml = zip.file("word/document.xml").asText();
  const arrobas = xml.split("@paranasegurospr").length - 1;
  console.log(`- ${d.filename}: troca ${m.midia}, ${arrobas} arroba(s)`);
  if (!APPLY) continue;
  const repo = new PizZip(fs.readFileSync(m.repo));
  zip.file(m.midia, repo.file(m.midia).asNodeBuffer());
  zip.file("word/document.xml", xml.replaceAll("@paranasegurospr", "@brasilbeneficiosbr"));
  const backup = `doc-templates/backup-troca-marca/${d.s3Key.split("/").pop()}`;
  await s3.send(new CopyObjectCommand({ Bucket, CopySource: encodeURIComponent(`${Bucket}/${d.s3Key}`), Key: backup }));
  await s3.send(new PutObjectCommand({ Bucket, Key: d.s3Key, Body: zip.generate({ type: "nodebuffer", compression: "DEFLATE" }), ContentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  console.log(`    gravado (cópia: ${backup})`);
}
await db.$disconnect();

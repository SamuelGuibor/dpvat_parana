"use server";

import { unstable_noStore as noStore } from "next/cache";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/app/_shared/lib/prisma";
import { requirePermission, requireTeam } from "@/app/_shared/lib/permissions-server";
import {
  builtinFilenames,
  listAllDocTemplates,
  listVisibleDocTemplates,
  type DocTemplateInfo,
  type DocTemplateKind,
} from "@/app/_shared/lib/doc-templates";

// Gestão dos modelos .docx em dois grupos (ver doc-templates.ts):
// - procuracao: modelos do "Gerar Procuração" do card;
// - assinatura: modelos do KIT de contrato que o bot manda pra assinatura.
// Enviar novos, renomear e excluir sem deploy. Modelos do repositório não
// saem do disco — excluir = ocultar (reversível); os enviados vivem no S3.
// Permissão dedicada: manage_templates.

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type { DocTemplateInfo, DocTemplateKind };

function normalizeKind(kind?: string): DocTemplateKind {
  return kind === "assinatura" ? "assinatura" : "procuracao";
}

/** Lista para o seletor de geração (só visíveis) — qualquer membro da equipe. */
export async function listDocTemplates(kind?: DocTemplateKind): Promise<DocTemplateInfo[]> {
  noStore();
  await requireTeam();
  return listVisibleDocTemplates(normalizeKind(kind));
}

/** Lista completa (inclui ocultos) — tela de gestão. */
export async function listDocTemplatesAdmin(kind?: DocTemplateKind): Promise<DocTemplateInfo[]> {
  noStore();
  await requirePermission("manage_templates");
  return listAllDocTemplates(normalizeKind(kind));
}

/**
 * Passo 1 do upload: presigned PUT (o .docx pode passar do limite de body da
 * Vercel, então o navegador manda direto pro S3 — mesmo padrão dos anexos).
 */
export async function getDocTemplateUploadUrl(
  name: string,
  kind?: DocTemplateKind,
): Promise<{ url: string; key: string; filename: string }> {
  await requirePermission("manage_templates");
  const k = normalizeKind(kind);

  const base = name.replace(/\.docx$/i, "").trim();
  if (!base) throw new Error("Nome do modelo vazio.");
  const filename = `${base}.docx`;

  const existing = await db.docTemplate.findUnique({ where: { filename } });
  const builtinHit =
    builtinFilenames("procuracao").includes(filename) ||
    builtinFilenames("assinatura").includes(filename);
  if (existing?.s3Key || builtinHit) {
    throw new Error(`Já existe um modelo chamado "${filename}" — renomeie o arquivo.`);
  }

  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const key = `doc-templates/${k}/${Date.now()}-${safe}`;
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      ContentType: DOCX_MIME,
    }),
    { expiresIn: 600 },
  );
  return { url, key, filename };
}

/** Passo 2: o PUT terminou — registra o modelo. */
export async function confirmDocTemplateUpload(input: {
  key: string;
  filename: string;
  label?: string;
  kind?: DocTemplateKind;
}): Promise<DocTemplateInfo[]> {
  await requirePermission("manage_templates");
  if (!input.key.startsWith("doc-templates/")) throw new Error("Chave inválida.");
  const k = normalizeKind(input.kind);

  await db.docTemplate.upsert({
    where: { filename: input.filename },
    create: {
      filename: input.filename,
      label: input.label?.trim() || null,
      s3Key: input.key,
      kind: k,
    },
    // upsert cobre a linha "fantasma" de um builtin removido do disco.
    update: { s3Key: input.key, label: input.label?.trim() || null, hidden: false, kind: k },
  });
  return listAllDocTemplates(k);
}

/** Renomeia o nome de exibição (vale para modelos do repositório e enviados). */
export async function renameDocTemplate(
  filename: string,
  label: string,
  kind?: DocTemplateKind,
): Promise<DocTemplateInfo[]> {
  await requirePermission("manage_templates");
  const k = normalizeKind(kind);
  const clean = label.trim();
  if (!clean) throw new Error("Nome vazio.");

  await db.docTemplate.upsert({
    where: { filename },
    create: { filename, label: clean, kind: k },
    update: { label: clean },
  });
  return listAllDocTemplates(k);
}

/**
 * Exclui um modelo: enviado → some de vez (S3 + banco); do repositório →
 * fica oculto (dá para restaurar). No grupo assinatura, o KIT nunca pode
 * ficar sem nenhum modelo ativo (o bot não teria o que mandar assinar).
 */
export async function deleteDocTemplate(
  filename: string,
  kind?: DocTemplateKind,
): Promise<DocTemplateInfo[]> {
  await requirePermission("manage_templates");
  const k = normalizeKind(kind);

  if (k === "assinatura") {
    const visible = await listVisibleDocTemplates("assinatura");
    if (visible.length <= 1 && visible.some((t) => t.filename === filename)) {
      throw new Error(
        "Este é o último modelo ativo do contrato — o bot precisa de ao menos um. Adicione ou restaure outro antes de excluir.",
      );
    }
  }

  const row = await db.docTemplate.findUnique({ where: { filename } });
  if (row?.s3Key) {
    await s3
      .send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: row.s3Key }))
      .catch((err) => console.error("[DOC-TEMPLATES] Falha ao apagar do S3:", err));
    await db.docTemplate.delete({ where: { id: row.id } });
  } else {
    await db.docTemplate.upsert({
      where: { filename },
      create: { filename, hidden: true, kind: k },
      update: { hidden: true },
    });
  }
  return listAllDocTemplates(k);
}

/** Restaura um modelo do repositório que foi ocultado. */
export async function restoreDocTemplate(
  filename: string,
  kind?: DocTemplateKind,
): Promise<DocTemplateInfo[]> {
  await requirePermission("manage_templates");
  const k = normalizeKind(kind);
  await db.docTemplate
    .update({ where: { filename }, data: { hidden: false } })
    .catch(() => {});
  return listAllDocTemplates(k);
}

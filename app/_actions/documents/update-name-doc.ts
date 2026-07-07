"use server";

import { S3Client, CopyObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { db } from "../../_shared/lib/prisma";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET_NAME!;

function extractExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot !== -1 ? name.slice(dot) : "";
}

export async function updateDocumentName({
  id,
  newName,
}: {
  id: string;
  newName: string;
}) {
  if (!id || !newName.trim()) {
    throw new Error("ID ou nome inválido.");
  }

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) throw new Error("Documento não encontrado.");

  // Garante que a extensão original seja preservada
  const originalExt = extractExtension(doc.key); // extensão pelo key do S3 (mais confiável)
  let safeName = newName.trim();
  if (originalExt && !safeName.toLowerCase().endsWith(originalExt.toLowerCase())) {
    safeName = safeName + originalExt;
  }

  // Cria novo key S3 mantendo o mesmo prefixo (pasta)
  const lastSlash = doc.key.lastIndexOf("/");
  const prefix = lastSlash !== -1 ? doc.key.slice(0, lastSlash + 1) : "";
  const newKey = `${prefix}${Date.now()}-${safeName.replace(/[^a-zA-Z0-9._\-À-ž]/g, "_")}`;

  try {
    // Copia para o novo key
    await s3.send(
      new CopyObjectCommand({
        Bucket: BUCKET,
        CopySource: `${BUCKET}/${doc.key}`,
        Key: newKey,
      })
    );

    // Remove o key antigo
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: doc.key,
      })
    );
  } catch (err) {
    console.error("[RENAME S3]", err);
    // Se S3 falhar, ainda atualiza o nome no DB (o download usa o campo name para o Content-Disposition)
    return db.document.update({
      where: { id },
      data: { name: safeName },
      select: { id: true, name: true, key: true },
    });
  }

  // Atualiza DB com novo key e nome
  return db.document.update({
    where: { id },
    data: { key: newKey, name: safeName },
    select: { id: true, name: true, key: true },
  });
}

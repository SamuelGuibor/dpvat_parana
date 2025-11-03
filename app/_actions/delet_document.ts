"use server";

import { db } from "../_lib/prisma";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export const deletDoc = async (docId: string) => {
  try {
    // Buscar o documento para obter a key do S3
    const document = await db.document.findUnique({
      where: { id: docId },
      select: { key: true },
    });

    if (!document) {
      throw new Error(`Documento com ID ${docId} não encontrado.`);
    }

    // Deletar do S3
    const deleteCommand = new DeleteObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: document.key,
    });
    await s3Client.send(deleteCommand);

    // Deletar do banco de dados
    await db.document.delete({
      where: { id: docId },
    });
  } catch (error) {
    console.error("Erro ao deletar documento:", error);
    throw error; // Re-lançar o erro para ser capturado no client-side
  }
};
"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";
import { createLog } from "../_lib/log";
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
    // Buscar o documento para obter a key do S3 e os dados para o histórico.
    const document = await db.document.findUnique({
      where: { id: docId },
      select: { key: true, name: true, userId: true, processId: true },
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

    // Registra no histórico do card quem removeu o documento.
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      await createLog({
        action: "document_remove",
        message: `removeu o documento "${document.name}"`,
        authorId: session.user.id,
        authorName: session.user.name ?? "Usuário",
        userId: document.processId ? null : document.userId,
        processId: document.processId ?? null,
        metadata: { name: document.name },
      });
    }
  } catch (error) {
    console.error("Erro ao deletar documento:", error);
    throw error; // Re-lançar o erro para ser capturado no client-side
  }
};
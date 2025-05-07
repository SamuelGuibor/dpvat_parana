/* eslint-disable @typescript-eslint/no-explicit-any */
// app/_actions/downloadS3.ts
'use server';

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

interface DownloadFileResponse {
  success: boolean;
  fileContent?: Buffer;
  fileName?: string;
  contentType?: string;
  error?: string;
}

export async function downloadFileFromS3(key: string, fileName: string): Promise<DownloadFileResponse> {
  try {
    if (!key) {
      throw new Error('Chave do arquivo não fornecida');
    }

    console.log('Baixando arquivo do S3:', key); // Log para depuração

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
    });

    const { Body, ContentType } = await s3Client.send(command);

    if (!Body) {
      throw new Error('Conteúdo do arquivo não encontrado');
    }

    // Converter o Body (ReadableStream) em Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of Body as any) {
      chunks.push(chunk);
    }
    const fileContent = Buffer.concat(chunks);

    return {
      success: true,
      fileContent,
      fileName,
      contentType: ContentType || 'application/octet-stream',
    };
  } catch (error: any) {
    console.error('Erro ao baixar arquivo do S3:', error);
    return { success: false, error: `Falha ao baixar arquivo: ${error.message}` };
  }
}
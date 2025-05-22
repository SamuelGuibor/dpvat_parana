/* eslint-disable @typescript-eslint/no-explicit-any */
'use server';

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

interface DownloadFileResponse {
  success: boolean;
  presignedUrl?: string;
  fileName?: string;
  error?: string;
}

export async function downloadFileFromS3(key: string, fileName: string): Promise<DownloadFileResponse> {
  try {
    if (!key) {
      throw new Error('Chave do arquivo não fornecida');
    }

    console.log('Gerando URL pré-assinada para o arquivo:', key); // Log para depuração

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
    });

    // Gerar URL pré-assinada com validade de 1 hora (3600 segundos)
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return {
      success: true,
      presignedUrl,
      fileName,
    };
  } catch (error: any) {
    console.error('Erro ao gerar URL pré-assinada do S3:', error);
    return { success: false, error: `Falha ao gerar URL pré-assinada: ${error.message}` };
  }
}
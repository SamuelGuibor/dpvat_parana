'use server';

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/_shared/lib/auth';

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export interface ChatUploadResponse {
  success: boolean;
  url?: string; // URL pré-assinada de PUT (o browser sobe o arquivo direto no S3)
  key?: string;
  error?: string;
}

const MAX_BYTES = 25 * 1024 * 1024; // 25MB por anexo

/**
 * Gera uma URL pré-assinada para o browser subir um anexo do chat direto no S3
 * (prefixo "chat/<userId>/"). Só usuários autenticados; valida tamanho e nome.
 */
export async function getChatUploadUrl(input: { name: string; type: string; size: number }): Promise<ChatUploadResponse> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) throw new Error('Não autenticado.');

    if (!input.name) throw new Error('Nome do arquivo é obrigatório.');
    if (input.size > MAX_BYTES) throw new Error('Arquivo excede o limite de 25MB.');

    const safeName = input.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const key = `chat/${session.user.id}/${Date.now()}-${safeName}`;

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      ContentType: input.type || 'application/octet-stream',
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return { success: true, url, key };
  } catch (error) {
    console.error('[CHAT-UPLOAD] Erro ao gerar URL:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Falha ao preparar upload.' };
  }
}

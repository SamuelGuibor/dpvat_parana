/* eslint-disable @typescript-eslint/no-explicit-any */
'use server';

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { db } from '@/app/_shared/lib/prisma';
import { contentDisposition, hasTraversalSegment, isAllowedKeyPrefix } from '@/app/_shared/utils/s3-keys';

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

// Esta action é chamada também por páginas públicas (área do cliente), então
// qualquer visitante consegue invocá-la. Sem a allowlist de prefixos
// (ALLOWED_KEY_PREFIXES, em s3-keys.ts — a mesma do assinador da thread), ela
// viraria um leitor arbitrário do bucket inteiro. Nenhum helper exportado
// daqui: todo export de arquivo "use server" vira endpoint público.
async function isAllowedKey(key: string): Promise<boolean> {
  if (hasTraversalSegment(key)) return false;
  if (isAllowedKeyPrefix(key)) return true;
  // Documentos antigos podem ter chave fora dos prefixos atuais: se a chave
  // está registrada na tabela de documentos, o download continua liberado.
  const doc = await db.document.findFirst({ where: { key }, select: { id: true } });
  return doc !== null;
}

export async function downloadFileFromS3(
  key: string,
  fileName: string,
  inline = false,
): Promise<DownloadFileResponse> {
  try {
    if (!key) {
      throw new Error('Chave do arquivo não fornecida');
    }
    if (!(await isAllowedKey(key))) {
      console.warn('[S3] Chave fora dos prefixos permitidos, download negado:', key);
      throw new Error('Arquivo não permitido');
    }

    console.log('Gerando URL pré-assinada para o arquivo:', key); // Log para depuração

    const command = new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: key,
      // inline: abre no navegador (pré-visualização); attachment: força o download.
      // Mesmo header do assinador da thread (s3-presign.ts): filename* em UTF-8
      // para acento e fallback ASCII sem aspas.
      ResponseContentDisposition: contentDisposition(inline, fileName),
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
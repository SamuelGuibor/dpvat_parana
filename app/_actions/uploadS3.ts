'use server'

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

interface FileInfo {
  name: string;
  type: string;
}

export interface PresignedUrl {
  fileName: string;
  url: string;
  key: string;
}

export interface PresignedUrlResponse {
  success: boolean;
  presignedUrls?: PresignedUrl[];
  error?: string;
}

export async function getPresignedUrls(fileInfos: FileInfo[], userId: string): Promise<PresignedUrlResponse> {
  try {
    if (!userId) {
      throw new Error('ID do usuário não fornecido');
    }

    const presignedUrls = await Promise.all(
      fileInfos.map(async (file) => {
        const fileName = `${Date.now()}-${file.name}`;
        const key = `uploads/user_${userId}/${fileName}`;

        const command = new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: key,
          ContentType: file.type,
          Metadata: { userId },
        });

        const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        return { fileName: file.name, url, key };
      })
    );

    return { success: true, presignedUrls };
  } catch (error) {
    console.error("Erro ao gerar URLs pré-assinadas:", error);
    return { success: false, error: `Falha ao gerar URLs pré-assinadas` };
  }
}
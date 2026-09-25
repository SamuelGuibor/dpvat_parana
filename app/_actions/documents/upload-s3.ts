"use server";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireTeam } from "../../_shared/lib/permissions-server";
import { cardUploadKey } from "../../_shared/utils/s3-keys";

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

// A URL assinada dá escrita direta no bucket: só equipe pode pedir (cliente
// logado por CPF também tem sessão e passaria pelo middleware). O erro volta
// como valor, não como throw, porque throw de server action chega mascarado
// em produção e a aba mostraria uma mensagem sem sentido.
async function teamGuard(): Promise<string | null> {
  try {
    await requireTeam();
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "Acesso restrito à equipe.";
  }
}

export async function getPresignedUrls(fileInfos: FileInfo[], itemId: string, isProcess: boolean): Promise<PresignedUrlResponse> {
  const denied = await teamGuard();
  if (denied) return { success: false, error: denied };
  try {
    if (!itemId) {
      throw new Error(isProcess ? 'ID do processo não fornecido' : 'ID do usuário não fornecido');
    }

    // Um timestamp por lote + índice do arquivo: dois arquivos de mesmo nome
    // no mesmo lote precisam de keys diferentes (ver cardUploadKey). A ordem
    // do retorno é a de fileInfos (Promise.all preserva), e o FilesTab pareia
    // URL ↔ arquivo pelo índice.
    const batchTs = Date.now();
    const presignedUrls = await Promise.all(
      fileInfos.map(async (file, idx) => {
        const key = cardUploadKey(itemId, isProcess, batchTs, idx, file.name);

        const command = new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: key,
          // O navegador faz o PUT com este MESMO Content-Type (a assinatura o
          // inclui); tipo vazio vira octet-stream nos dois lados.
          ContentType: file.type || "application/octet-stream",
          Metadata: { itemId, isProcess: isProcess.toString() },
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

/**
 * Gera presigned PUTs para os anexos do chat de Roteiros.
 *
 * Esses arquivos são TEMPORÁRIOS (vão para o prefixo `roteiro-temp/`): o
 * navegador os envia direto ao S3 — contornando o limite de 4.5 MB de body
 * das serverless functions da Vercel — e o backend (/api/roteiro) os baixa,
 * repassa ao converter e os apaga. Não criam registro de Document no banco.
 */
export async function getRoteiroUploadUrls(fileInfos: FileInfo[], cardId: string): Promise<PresignedUrlResponse> {
  const denied = await teamGuard();
  if (denied) return { success: false, error: denied };
  try {
    const batch = Date.now();
    const presignedUrls = await Promise.all(
      fileInfos.map(async (file, idx) => {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const key = `roteiro-temp/${cardId || "no-card"}/${batch}-${idx}-${safeName}`;

        const command = new PutObjectCommand({
          Bucket: process.env.AWS_S3_BUCKET_NAME,
          Key: key,
          ContentType: file.type || "application/octet-stream",
        });

        const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        return { fileName: file.name, url, key };
      })
    );

    return { success: true, presignedUrls };
  } catch (error) {
    console.error("Erro ao gerar URLs pré-assinadas (roteiro):", error);
    return { success: false, error: `Falha ao gerar URLs pré-assinadas` };
  }
}
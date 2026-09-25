import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  SIGNED_URL_EXPIRES_S, contentDisposition, fileNameFromKey, isAllowedKeyPrefix, signingWindow,
} from '@/app/_shared/utils/s3-keys';

// Assinador de URL de LEITURA para o servidor (rota da thread do WhatsApp e
// listagem de documentos da ficha). Fica em lib, SEM "use server": helper
// exportado de arquivo "use server" vira endpoint público, e este aqui assina
// qualquer key que receber. Quem chama já passou pelo guard da equipe.
//
// Antes cada bolha de mídia chamava a server action downloadFileFromS3 no
// mount: abrir uma conversa enfileirava de 3 a 11 actions na fila serial do
// navegador, as imagens chegavam uma por uma e o clique do atendente esperava.

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export interface SignedGetUrl {
  url: string;
  /** ISO: fim da validade da URL (≥ 60 min no momento da assinatura). */
  expiresAt: string;
}

/**
 * URL pré-assinada de GET, estável dentro da janela de 30 min
 * (`signingWindow`): mesma key + mesmo nome + mesmo modo = mesma URL em todo
 * poll. getSignedUrl é CPU local (HMAC), sem ida à rede. NÃO confere se o
 * objeto existe: key apagada gera URL que dá 403/404 no navegador — a UI trata
 * no onError da mídia ("Arquivo indisponível").
 *
 * Rejeita key fora de ALLOWED_KEY_PREFIXES (defesa em profundidade: o
 * assinador não pode virar leitor arbitrário do bucket para quem o importar).
 */
export async function signGetUrl(
  key: string,
  { fileName, inline = true }: { fileName?: string; inline?: boolean } = {},
): Promise<SignedGetUrl> {
  if (!isAllowedKeyPrefix(key)) throw new Error('Arquivo não permitido');
  const { signingDate, expiresAt } = signingWindow(Date.now());
  const command = new GetObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: contentDisposition(inline, fileName || fileNameFromKey(key)),
  });
  const url = await getSignedUrl(s3, command, { signingDate, expiresIn: SIGNED_URL_EXPIRES_S });
  return { url, expiresAt: expiresAt.toISOString() };
}

/**
 * Versão que nunca lança: key fora da allowlist ou erro de assinatura viram
 * `null` e o navegador cai no fallback (action no clique/mount). Uma mídia
 * problemática não pode derrubar a thread inteira.
 */
export async function trySignGetUrl(
  key: string,
  opts: { fileName?: string; inline?: boolean } = {},
): Promise<SignedGetUrl | null> {
  if (!isAllowedKeyPrefix(key)) return null;
  try {
    return await signGetUrl(key, opts);
  } catch (err) {
    console.warn('[S3] falha ao assinar URL de leitura:', key, err);
    return null;
  }
}

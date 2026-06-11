import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export const S3_BUCKET = process.env.AWS_S3_BUCKET_NAME || "paranasegurosdpvat";

const DIACRITIC_RE = /[̀-ͯ]/g;

export function slugifyFolder(input: string): string {
  return (
    input
      .normalize("NFD")
      .replace(DIACRITIC_RE, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || `pasta-${Date.now()}`
  );
}

export function buildInstructionKey(folderName: string, fileName: string) {
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `instructions/${folderName}/${Date.now()}-${safeFileName}`;
}

export async function uploadBufferToS3(
  key: string,
  buffer: Buffer,
  contentType: string,
) {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
    }),
  );
}

export async function getDownloadUrl(key: string, fileName: string) {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${fileName}"`,
  });
  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

export async function getViewUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

export async function deleteS3Object(key: string) {
  await s3Client.send(
    new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }),
  );
}

export async function deleteS3Folder(folderName: string) {
  const prefix = `instructions/${folderName}/`;
  const listed = await s3Client.send(
    new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix }),
  );
  if (!listed.Contents || listed.Contents.length === 0) return;

  await s3Client.send(
    new DeleteObjectsCommand({
      Bucket: S3_BUCKET,
      Delete: {
        Objects: listed.Contents.map((o) => ({ Key: o.Key! })),
        Quiet: true,
      },
    }),
  );
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function fileExtType(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "default";
}

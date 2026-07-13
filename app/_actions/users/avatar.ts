"use server";

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerSession } from "next-auth";
import { authOptions } from "../../_shared/lib/auth";
import { db } from "../../_shared/lib/prisma";

// Foto de perfil do PRÓPRIO usuário — exclusivo da equipe do nova-dash
// (roles ADMIN*). Clientes normais continuam com a imagem que já têm no site
// (ex.: avatar do Google) — nada muda para eles.
//
// Fluxo: presigned PUT direto no S3 (key determinística "avatars/<userId>",
// re-upload sobrescreve) → confirmMyAvatar grava em User.image a URL interna
// "/api/avatar/<userId>?v=<ts>" (servida autenticada, com cache-buster).

const TEAM_ROLES = ["ADMIN", "ADMIN+", "ADMIN++"];
const ALLOWED_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png" };
const MAX_BYTES = 5 * 1024 * 1024; // 5MB

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function requireTeamMember(): Promise<{ id: string; role: string }> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Não autenticado.");
  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  });
  if (!me || !TEAM_ROLES.includes(me.role)) {
    throw new Error("Apenas membros da equipe podem alterar a foto de perfil.");
  }
  return me;
}

export interface AvatarUploadResponse {
  success: boolean;
  url?: string; // presigned PUT — o browser sobe o arquivo direto no S3
  error?: string;
}

/** Gera a URL pré-assinada para subir a foto (JPEG/PNG, máx. 5MB). */
export async function getAvatarUploadUrl(input: { type: string; size: number }): Promise<AvatarUploadResponse> {
  try {
    const me = await requireTeamMember();

    if (!ALLOWED_TYPES[input.type]) throw new Error("Formato inválido: envie uma imagem JPEG ou PNG.");
    if (input.size > MAX_BYTES) throw new Error("A imagem excede o limite de 5MB.");

    const command = new PutObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `avatars/${me.id}`,
      ContentType: input.type,
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 600 });
    return { success: true, url };
  } catch (error) {
    console.error("[AVATAR] Erro ao gerar URL de upload:", error);
    return { success: false, error: error instanceof Error ? error.message : "Falha ao preparar o upload." };
  }
}

/** Depois do upload no S3, grava a URL interna da foto no perfil. */
export async function confirmMyAvatar(): Promise<{ image: string }> {
  const me = await requireTeamMember();
  // ?v= força o browser a buscar a versão nova (a key no S3 é sempre a mesma).
  const image = `/api/avatar/${me.id}?v=${Date.now()}`;
  await db.user.update({ where: { id: me.id }, data: { image } });
  return { image };
}

/** Remove a foto de perfil (volta ao avatar de iniciais). */
export async function removeMyAvatar(): Promise<{ ok: true }> {
  const me = await requireTeamMember();
  await db.user.update({ where: { id: me.id }, data: { image: null } });
  // Limpeza do objeto no S3 é best-effort — falha aqui não impede a remoção.
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET_NAME, Key: `avatars/${me.id}` }));
  } catch (err) {
    console.error("[AVATAR] Falha ao apagar objeto no S3:", err);
  }
  return { ok: true };
}

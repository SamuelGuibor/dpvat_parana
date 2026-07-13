import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/_shared/lib/auth";

// Serve a foto de perfil da equipe a partir do S3 (key "avatars/<userId>").
// Só usuários logados enxergam (o middleware global já barra anônimos; a
// checagem aqui é defesa em profundidade). O ?v= na URL gravada em User.image
// faz o cache-busting; aqui liberamos cache privado de 1 dia por URL.

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function GET(
  _req: Request,
  { params }: { params: { userId: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Sanidade: o userId vira parte da key do S3 — só aceita ids "limpos".
  if (!/^[a-zA-Z0-9_-]+$/.test(params.userId)) {
    return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  }

  try {
    const obj = await s3.send(new GetObjectCommand({
      Bucket: process.env.AWS_S3_BUCKET_NAME,
      Key: `avatars/${params.userId}`,
    }));
    const bytes = await obj.Body?.transformToByteArray();
    if (!bytes) throw new Error("Objeto vazio");

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": obj.ContentType ?? "image/jpeg",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    // Sem foto (ou key inexistente) → 404; o <AvatarFallback> cobre na UI.
    return NextResponse.json({ error: "Foto não encontrada" }, { status: 404 });
  }
}

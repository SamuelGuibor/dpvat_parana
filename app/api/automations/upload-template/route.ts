/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "docx") {
      return NextResponse.json({ error: "Apenas arquivos .docx são aceitos" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `automation-templates/${Date.now()}-${safeName}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
    );

    const originalName = file.name.replace(/\.docx$/i, "");

    return NextResponse.json({ key, originalName });
  } catch (err: any) {
    console.error("[UPLOAD-TEMPLATE]", err);
    return NextResponse.json({ error: "Erro ao fazer upload do template" }, { status: 500 });
  }
}

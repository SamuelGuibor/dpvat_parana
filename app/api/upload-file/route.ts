/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { writeFile, unlink } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

const fileManager = new GoogleAIFileManager(process.env.GOOGLE_API_KEY!);

export async function POST(request: Request) {
  let tempPath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    tempPath = join(tmpdir(), `upload_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`);
    await writeFile(tempPath, buffer);

    const uploadResult = await fileManager.uploadFile(tempPath, {
      mimeType: file.type || "application/octet-stream",
      displayName: file.name,
    });

    return NextResponse.json({
      fileUri: uploadResult.file.uri,
      mimeType: uploadResult.file.mimeType,
    });
  } catch (error: any) {
    console.error("[UPLOAD-FILE] Erro:", error);
    return NextResponse.json({ error: "Erro ao fazer upload do arquivo" }, { status: 500 });
  } finally {
    if (tempPath) {
      await unlink(tempPath).catch(() => {});
    }
  }
}

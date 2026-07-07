import { NextResponse } from "next/server";
import { db } from "../../../_shared/lib/prisma";
import { getDownloadUrl, getViewUrl } from "../_s3";

// Rota depende de request.url (params da query), então é sempre dinâmica.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fileId = searchParams.get("fileId");
    const mode = searchParams.get("mode") || "download";

    if (!fileId) {
      return NextResponse.json(
        { error: "fileId é obrigatório" },
        { status: 400 },
      );
    }

    const file = await db.instructionFile.findUnique({
      where: { id: fileId },
      select: { key: true, name: true },
    });

    if (!file) {
      return NextResponse.json(
        { error: "Arquivo não encontrado" },
        { status: 404 },
      );
    }

    const url =
      mode === "view"
        ? await getViewUrl(file.key)
        : await getDownloadUrl(file.key, file.name);

    return NextResponse.json({ url, fileName: file.name });
  } catch (error) {
    console.error("[INSTRUCTIONS][DOWNLOAD]", error);
    return NextResponse.json(
      { error: "Erro ao gerar URL de download" },
      { status: 500 },
    );
  }
}

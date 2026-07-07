/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import JSZip from "jszip";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { db } from "@/app/_shared/lib/prisma";

// Rota depende de request.url (params da query), então é sempre dinâmica.
export const dynamic = "force-dynamic";

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

function extOf(key: string): string {
  const dot = key.lastIndexOf(".");
  return dot !== -1 ? key.slice(dot) : "";
}

// Garante nome com extensão e sem colisão dentro do zip.
function uniqueEntryName(name: string, key: string, used: Set<string>): string {
  const ext = extOf(key);
  let base = name;
  if (ext && !base.toLowerCase().endsWith(ext.toLowerCase())) base += ext;

  let candidate = base;
  let i = 1;
  while (used.has(candidate)) {
    const dot = base.lastIndexOf(".");
    candidate =
      dot > 0
        ? `${base.slice(0, dot)} (${i})${base.slice(dot)}`
        : `${base} (${i})`;
    i++;
  }
  used.add(candidate);
  return candidate;
}

function sanitizeFilename(name: string): string {
  return (name || "documentos").replace(/[^a-zA-Z0-9_-]+/g, "_").slice(0, 60);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const processId = searchParams.get("processId");

    if (!userId && !processId) {
      return NextResponse.json({ error: "userId ou processId é obrigatório" }, { status: 400 });
    }

    const where = processId ? { processId } : { userId: userId! };

    const documents = await db.document.findMany({
      where,
      select: { id: true, key: true, name: true },
      orderBy: { createdAt: "asc" },
    });

    if (documents.length === 0) {
      return NextResponse.json({ error: "Nenhum documento para baixar" }, { status: 404 });
    }

    // Nome amigável para o arquivo zip (nome da pessoa/processo).
    let ownerName = "documentos";
    try {
      if (processId) {
        const p = await db.process.findUnique({ where: { id: processId }, select: { name: true } });
        ownerName = p?.name || ownerName;
      } else if (userId) {
        const u = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
        ownerName = u?.name || ownerName;
      }
    } catch { /* mantém o nome padrão */ }

    const zip = new JSZip();
    const used = new Set<string>();
    const failed: string[] = [];

    await Promise.all(
      documents.map(async (doc) => {
        try {
          const res = await s3Client.send(
            new GetObjectCommand({
              Bucket: process.env.AWS_S3_BUCKET_NAME,
              Key: doc.key,
            })
          );
          const bytes = await (res.Body as any).transformToByteArray();
          zip.file(uniqueEntryName(doc.name, doc.key, used), bytes);
        } catch (err) {
          console.error(`[DOWNLOAD-ALL] Falha ao baixar "${doc.key}":`, err);
          failed.push(doc.name);
        }
      })
    );

    // Se nenhum arquivo foi baixado com sucesso, não entrega um zip vazio.
    if (Object.keys(zip.files).length === 0) {
      return NextResponse.json({ error: "Não foi possível baixar os arquivos" }, { status: 502 });
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const zipName = `documentos_${sanitizeFilename(ownerName)}.zip`;

    return new NextResponse(new Uint8Array(zipBuffer), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        // Informa ao cliente quantos (se algum) arquivos falharam.
        "X-Failed-Count": String(failed.length),
      },
    });
  } catch (error: any) {
    console.error("[DOWNLOAD-ALL] Erro:", error);
    return NextResponse.json({ error: error.message || "Erro ao gerar zip" }, { status: 500 });
  }
}

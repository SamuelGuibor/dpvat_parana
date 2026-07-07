/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { generatePDFFromText } from "@/app/_actions/documents/generate-pdf-from-template";

export async function POST(request: Request) {
  try {
    const { content, titulo, filename } = await request.json();

    if (!content) {
      return NextResponse.json(
        { error: "Conteúdo não fornecido" },
        { status: 400 }
      );
    }

    const pdfBuffer = await generatePDFFromText(
      content,
      titulo || "Documento da Seguros Paraná"
    );

    const safeFilename = filename
      ? filename.replace(/[^a-zA-Z0-9_-]/g, "_") + ".pdf"
      : `documento_${Date.now()}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error: any) {
    console.error("[PDF] Erro:", error);

    return NextResponse.json(
      { error: "Erro ao gerar PDF" },
      { status: 500 }
    );
  }
}
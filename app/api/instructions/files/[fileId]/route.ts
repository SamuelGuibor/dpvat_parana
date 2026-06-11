import { NextResponse } from "next/server";
import { db } from "../../../../_lib/prisma";
import { deleteS3Object } from "../../_s3";

type Ctx = { params: { fileId: string } };

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const file = await db.instructionFile.findUnique({
      where: { id: params.fileId },
      select: { key: true, instructionId: true },
    });

    if (!file) {
      return NextResponse.json(
        { error: "Arquivo não encontrado" },
        { status: 404 },
      );
    }

    await deleteS3Object(file.key);
    await db.instructionFile.delete({ where: { id: params.fileId } });

    await db.instruction.update({
      where: { id: file.instructionId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[INSTRUCTIONS][FILE][DELETE]", error);
    return NextResponse.json(
      { error: "Erro ao excluir arquivo" },
      { status: 500 },
    );
  }
}

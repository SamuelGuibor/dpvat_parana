import { NextResponse } from "next/server";
import { db } from "../../../_lib/prisma";
import {
  buildInstructionKey,
  fileExtType,
  formatBytes,
  uploadBufferToS3,
} from "../_s3";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const instructionId = formData.get("instructionId") as string | null;
    const file = formData.get("file") as File | null;

    if (!instructionId) {
      return NextResponse.json(
        { error: "instructionId é obrigatório" },
        { status: 400 },
      );
    }
    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 },
      );
    }

    const instruction = await db.instruction.findUnique({
      where: { id: instructionId },
      select: { folderName: true },
    });

    if (!instruction) {
      return NextResponse.json(
        { error: "Instrução não encontrada" },
        { status: 404 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const key = buildInstructionKey(instruction.folderName, file.name);
    await uploadBufferToS3(
      key,
      buffer,
      file.type || "application/octet-stream",
    );

    const created = await db.instructionFile.create({
      data: {
        instructionId,
        name: file.name,
        key,
        size: formatBytes(buffer.byteLength),
        type: fileExtType(file.name),
      },
      select: {
        id: true,
        name: true,
        key: true,
        size: true,
        type: true,
      },
    });

    await db.instruction.update({
      where: { id: instructionId },
      data: { updatedAt: new Date() },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[INSTRUCTIONS][UPLOAD]", error);
    return NextResponse.json(
      { error: "Erro ao fazer upload" },
      { status: 500 },
    );
  }
}

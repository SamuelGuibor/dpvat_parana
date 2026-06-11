import { NextResponse } from "next/server";
import { db } from "../../../_lib/prisma";
import { deleteS3Folder } from "../_s3";

type Ctx = { params: { id: string } };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const instruction = await db.instruction.findUnique({
      where: { id: params.id },
      include: {
        files: {
          orderBy: { uploadedAt: "asc" },
          select: {
            id: true,
            name: true,
            key: true,
            size: true,
            type: true,
          },
        },
      },
    });

    if (!instruction) {
      return NextResponse.json(
        { error: "Instrução não encontrada" },
        { status: 404 },
      );
    }

    return NextResponse.json(instruction);
  } catch (error) {
    console.error("[INSTRUCTIONS][GET][:id]", error);
    return NextResponse.json(
      { error: "Erro ao buscar instrução" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request, { params }: Ctx) {
  try {
    const body = await request.json();
    const { title, description, text, color, tags } = body as {
      title?: string;
      description?: string;
      text?: string;
      color?: string;
      tags?: string[];
    };

    if (!title || !title.trim()) {
      return NextResponse.json(
        { error: "Título é obrigatório" },
        { status: 400 },
      );
    }

    const updated = await db.instruction.update({
      where: { id: params.id },
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        text: text?.trim() || null,
        color: color || "amber",
        tags: Array.isArray(tags) ? tags : [],
      },
      include: {
        files: {
          orderBy: { uploadedAt: "asc" },
          select: {
            id: true,
            name: true,
            key: true,
            size: true,
            type: true,
          },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[INSTRUCTIONS][PUT][:id]", error);
    return NextResponse.json(
      { error: "Erro ao atualizar instrução" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const existing = await db.instruction.findUnique({
      where: { id: params.id },
      select: { folderName: true },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Instrução não encontrada" },
        { status: 404 },
      );
    }

    await deleteS3Folder(existing.folderName);

    await db.instruction.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[INSTRUCTIONS][DELETE][:id]", error);
    return NextResponse.json(
      { error: "Erro ao excluir instrução" },
      { status: 500 },
    );
  }
}

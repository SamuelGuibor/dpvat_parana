import { NextResponse } from "next/server";
import { db } from "../../_shared/lib/prisma";
import { slugifyFolder } from "./_s3";

export async function GET() {
  try {
    const instructions = await db.instruction.findMany({
      orderBy: { updatedAt: "desc" },
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

    return NextResponse.json(instructions);
  } catch (error) {
    console.error("[INSTRUCTIONS][GET]", error);
    return NextResponse.json(
      { error: "Erro ao listar instruções" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
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

    const baseFolder = slugifyFolder(title);
    let folderName = baseFolder;
    let suffix = 1;
    while (await db.instruction.findUnique({ where: { folderName } })) {
      folderName = `${baseFolder}-${suffix++}`;
    }

    const created = await db.instruction.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        text: text?.trim() || null,
        color: color || "amber",
        tags: Array.isArray(tags) ? tags : [],
        folderName,
      },
      include: { files: true },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[INSTRUCTIONS][POST]", error);
    return NextResponse.json(
      { error: "Erro ao criar instrução" },
      { status: 500 },
    );
  }
}

import { NextResponse } from "next/server";
import { db } from "@/app/_shared/lib/prisma";

// PUT — update a prompt
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { title, content } = await request.json();

    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json(
        { error: "Titulo e conteudo sao obrigatorios" },
        { status: 400 }
      );
    }

    const prompt = await db.savedPrompt.update({
      where: { id },
      data: {
        title: title.trim(),
        content: content.trim(),
      },
    });

    return NextResponse.json(prompt);
  } catch (error) {
    console.error("[PROMPTS] Erro ao atualizar:", error);
    return NextResponse.json({ error: "Erro ao atualizar prompt" }, { status: 500 });
  }
}

// DELETE — delete a prompt
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.savedPrompt.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[PROMPTS] Erro ao excluir:", error);
    return NextResponse.json({ error: "Erro ao excluir prompt" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { db } from "@/app/_lib/prisma";

// GET — list all prompts
export async function GET() {
  try {
    const prompts = await db.savedPrompt.findMany({
      orderBy: { order: "asc" },
    });
    return NextResponse.json(prompts);
  } catch (error) {
    console.error("[PROMPTS] Erro ao listar:", error);
    return NextResponse.json({ error: "Erro ao listar prompts" }, { status: 500 });
  }
}

// POST — create a new prompt
export async function POST(request: Request) {
  try {
    const { title, content } = await request.json();

    if (!title?.trim() || !content?.trim()) {
      return NextResponse.json(
        { error: "Titulo e conteudo sao obrigatorios" },
        { status: 400 }
      );
    }

    const count = await db.savedPrompt.count();

    const prompt = await db.savedPrompt.create({
      data: {
        title: title.trim(),
        content: content.trim(),
        order: count,
      },
    });

    return NextResponse.json(prompt, { status: 201 });
  } catch (error) {
    console.error("[PROMPTS] Erro ao criar:", error);
    return NextResponse.json({ error: "Erro ao criar prompt" }, { status: 500 });
  }
}

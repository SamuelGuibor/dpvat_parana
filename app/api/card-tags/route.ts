import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_shared/lib/prisma";

// Tags livres dos cards do kanban (CardTag). Auth: middleware global.
//   GET    → lista todas as tags
//   POST   → cria { name, color }
//   PUT    → atualiza { id, name?, color? }
//   DELETE → ?id=<tagId> (sai de todos os cards via cascade do join)

export const dynamic = "force-dynamic";

export interface CardTagDTO {
  id: string;
  name: string;
  color: string;
}

export async function GET() {
  const tags = await db.cardTag.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });
  return NextResponse.json(tags);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const color = typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)
    ? body.color
    : "#6366f1";
  if (!name) return NextResponse.json({ error: "Nome da tag é obrigatório." }, { status: 400 });
  if (name.length > 30) return NextResponse.json({ error: "Nome da tag muito longo (máx. 30)." }, { status: 400 });

  const existing = await db.cardTag.findUnique({ where: { name } });
  if (existing) return NextResponse.json({ error: "Já existe uma tag com esse nome." }, { status: 409 });

  const tag = await db.cardTag.create({
    data: { name, color },
    select: { id: true, name: true, color: true },
  });
  return NextResponse.json(tag, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });

  const data: { name?: string; color?: string } = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 30);
  if (typeof body.color === "string" && /^#[0-9a-fA-F]{6}$/.test(body.color)) data.color = body.color;
  if (!Object.keys(data).length) return NextResponse.json({ error: "Nada para atualizar." }, { status: 400 });

  try {
    const tag = await db.cardTag.update({
      where: { id },
      data,
      select: { id: true, name: true, color: true },
    });
    return NextResponse.json(tag);
  } catch {
    return NextResponse.json({ error: "Tag não encontrada (ou nome duplicado)." }, { status: 404 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });
  try {
    await db.cardTag.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Tag não encontrada." }, { status: 404 });
  }
}

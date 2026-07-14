import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_shared/lib/prisma";

// Liga/desliga uma tag num card (User ou Process).
// POST { cardId, isProcess, tagId, on } → { tags: CardTagDTO[] } (tags atuais do card)

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const cardId = typeof body.cardId === "string" ? body.cardId : "";
  const tagId = typeof body.tagId === "string" ? body.tagId : "";
  const isProcess = !!body.isProcess;
  const on = !!body.on;
  if (!cardId || !tagId) {
    return NextResponse.json({ error: "cardId e tagId são obrigatórios." }, { status: 400 });
  }

  const op = { [on ? "connect" : "disconnect"]: { id: tagId } };

  try {
    if (isProcess) {
      const updated = await db.process.update({
        where: { id: cardId },
        data: { cardTags: op },
        select: { cardTags: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" } } },
      });
      return NextResponse.json({ tags: updated.cardTags });
    }
    const updated = await db.user.update({
      where: { id: cardId },
      data: { cardTags: op },
      select: { cardTags: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" } } },
    });
    return NextResponse.json({ tags: updated.cardTags });
  } catch {
    return NextResponse.json({ error: "Card ou tag não encontrados." }, { status: 404 });
  }
}

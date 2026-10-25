import { readOnlyBlock, teamRoute } from "@/app/_shared/lib/route-auth";
import { NextRequest, NextResponse } from "next/server";
import { setCardTag } from "@/app/_shared/lib/cards/tags";
import { CardWriteError } from "@/app/_shared/lib/cards/types";

// Liga/desliga uma tag num card (User ou Process).
// POST { cardId, isProcess, tagId, on } → { tags: CardTagDTO[] } (tags atuais do card)
// Grava log tag_add/tag_remove quando a tag de fato muda (app/_shared/lib/cards/tags.ts).

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await teamRoute();
  if ("res" in auth) return auth.res;
  const blocked = await readOnlyBlock();
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  const cardId = typeof body.cardId === "string" ? body.cardId : "";
  const tagId = typeof body.tagId === "string" ? body.tagId : "";
  const isProcess = !!body.isProcess;
  const on = !!body.on;
  if (!cardId || !tagId) {
    return NextResponse.json({ error: "cardId e tagId são obrigatórios." }, { status: 400 });
  }

  try {
    const { tags } = await setCardTag({
      cardId,
      isProcess,
      tagId,
      on,
      author: { id: auth.ctx.userId, name: auth.ctx.name ?? "Usuário" },
    });
    return NextResponse.json({ tags });
  } catch (err) {
    if (err instanceof CardWriteError) {
      return NextResponse.json({ error: "Card ou tag não encontrados." }, { status: 404 });
    }
    console.error("[card-tags/assign]", err);
    return NextResponse.json({ error: "Falha ao salvar a tag." }, { status: 500 });
  }
}

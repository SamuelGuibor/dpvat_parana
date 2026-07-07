import { NextResponse } from "next/server";
import { db } from "../../../_shared/lib/prisma";

type Ctx = { params: { id: string } };

export async function PATCH(request: Request, { params }: Ctx) {
  try {
    const body = await request.json();
    const data: { text?: string; checked?: boolean; order?: number } = {};
    if (typeof body.text === "string") data.text = body.text.trim();
    if (typeof body.checked === "boolean") data.checked = body.checked;
    if (typeof body.order === "number") data.order = body.order;

    const updated = await db.adminChecklistItem.update({
      where: { id: params.id },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("[ADMIN-CHECKLIST][PATCH][:id]", error);
    return NextResponse.json(
      { error: "Erro ao atualizar item" },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await db.adminChecklistItem.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ADMIN-CHECKLIST][DELETE][:id]", error);
    return NextResponse.json(
      { error: "Erro ao excluir item" },
      { status: 500 },
    );
  }
}

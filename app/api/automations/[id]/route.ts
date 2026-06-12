import { NextResponse } from "next/server";
import { updateAutomation, deleteAutomation } from "@/app/_lib/db/automations";

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();
    const updated = await updateAutomation(params.id, body);
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[AUTOMATIONS PUT]", err);
    return NextResponse.json({ error: "Erro ao atualizar automação" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    await deleteAutomation(params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[AUTOMATIONS DELETE]", err);
    return NextResponse.json({ error: "Erro ao deletar automação" }, { status: 500 });
  }
}

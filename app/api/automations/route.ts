import { NextResponse } from "next/server";
import { fetchAutomations, createAutomation } from "@/app/_shared/lib/db/automations";

export async function GET() {
  try {
    const automations = await fetchAutomations();
    return NextResponse.json(automations);
  } catch (err) {
    console.error("[AUTOMATIONS GET]", err);
    return NextResponse.json({ error: "Erro ao buscar automações" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, triggerLabelId, cardType, conditionLogic, conditions, actions } = body;

    if (!name || !triggerLabelId) {
      return NextResponse.json({ error: "Nome e etiqueta são obrigatórios" }, { status: 400 });
    }

    const automation = await createAutomation({
      name,
      triggerLabelId,
      cardType: cardType ?? "both",
      conditionLogic: conditionLogic ?? "AND",
      conditions: conditions ?? [],
      actions: actions ?? [],
    });

    return NextResponse.json(automation, { status: 201 });
  } catch (err) {
    console.error("[AUTOMATIONS POST]", err);
    return NextResponse.json({ error: "Erro ao criar automação" }, { status: 500 });
  }
}

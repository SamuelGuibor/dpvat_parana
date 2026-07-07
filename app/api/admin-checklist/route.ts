import { NextResponse } from "next/server";
import { db } from "../../_shared/lib/prisma";

const DEFAULT_ITEMS: string[] = [
  "ASSINOU A PROCURAÇÃO",
  "SENHA INSS/DOCS INSS",
  "COMPROVANTE DE ENDEREÇO",
  "PRONTUÁRIO ANEXADO",
  "ROTEIRO",
  "DOCUMENTO ATUALIZADO",
];

type ItemRow = {
  id: string;
  processId: string | null;
  userId: string | null;
  text: string;
  checked: boolean;
  order: number;
  createdAt: Date;
  updatedAt: Date;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const processId = searchParams.get("processId");
    const userId = searchParams.get("userId");

    if (!processId && !userId) {
      return NextResponse.json(
        { error: "processId ou userId é obrigatório" },
        { status: 400 },
      );
    }

    const where = processId ? { processId } : { userId: userId! };

    // Tudo dentro de uma transação para evitar race condition entre o
    // "verificar se está vazio" e o "criar os defaults".
    const finalItems = await db.$transaction(async (tx) => {
      let items: ItemRow[] = await tx.adminChecklistItem.findMany({
        where,
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      });

      // Primeira carga deste card: semeia os itens padrão.
      if (items.length === 0) {
        await tx.adminChecklistItem.createMany({
          data: DEFAULT_ITEMS.map((text, i) => ({
            processId: processId ?? null,
            userId: userId ?? null,
            text,
            checked: false,
            order: i,
          })),
        });
        items = await tx.adminChecklistItem.findMany({
          where,
          orderBy: [{ order: "asc" }, { createdAt: "asc" }],
        });
      }

      // Dedupe defensivo: se já existirem duplicatas (efeito colateral de
      // uma corrida anterior antes deste fix), mantém o mais antigo de cada
      // texto e apaga o resto.
      const seen = new Set<string>();
      const toDelete: string[] = [];
      for (const item of items) {
        const key = item.text.trim().toLowerCase();
        if (seen.has(key)) {
          toDelete.push(item.id);
        } else {
          seen.add(key);
        }
      }
      if (toDelete.length > 0) {
        await tx.adminChecklistItem.deleteMany({
          where: { id: { in: toDelete } },
        });
        items = items.filter((i) => !toDelete.includes(i.id));
      }

      return items;
    });

    return NextResponse.json(finalItems);
  } catch (error) {
    console.error("[ADMIN-CHECKLIST][GET]", error);
    return NextResponse.json(
      { error: "Erro ao listar itens" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { processId, userId, text } = body as {
      processId?: string;
      userId?: string;
      text?: string;
    };

    if (!processId && !userId) {
      return NextResponse.json(
        { error: "processId ou userId é obrigatório" },
        { status: 400 },
      );
    }
    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: "Texto é obrigatório" },
        { status: 400 },
      );
    }

    const last = await db.adminChecklistItem.findFirst({
      where: processId ? { processId } : { userId: userId! },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    const created = await db.adminChecklistItem.create({
      data: {
        processId: processId ?? null,
        userId: userId ?? null,
        text: text.trim(),
        order: (last?.order ?? -1) + 1,
      },
    });

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error("[ADMIN-CHECKLIST][POST]", error);
    return NextResponse.json(
      { error: "Erro ao criar item" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const processId = searchParams.get("processId");
    const userId = searchParams.get("userId");
    const onlyChecked = searchParams.get("onlyChecked") === "true";

    if (!processId && !userId) {
      return NextResponse.json(
        { error: "processId ou userId é obrigatório" },
        { status: 400 },
      );
    }

    const where = processId ? { processId } : { userId: userId! };
    const final = onlyChecked ? { ...where, checked: true } : where;

    const result = await db.adminChecklistItem.deleteMany({ where: final });
    return NextResponse.json({ deleted: result.count });
  } catch (error) {
    console.error("[ADMIN-CHECKLIST][DELETE-MANY]", error);
    return NextResponse.json(
      { error: "Erro ao excluir itens" },
      { status: 500 },
    );
  }
}

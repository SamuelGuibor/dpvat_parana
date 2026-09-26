import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/_shared/lib/auth";
import { db } from "@/app/_shared/lib/prisma";
import { WA_QUALIFIED_MARK } from "@/app/_shared/lib/whatsapp/close-categories";
import { QUALIFIED_PIN_MS, mergeBellNotifications } from "@/app/_shared/utils/alert-policy";

// O sino mostra as 50 mais novas. O LEAD QUALIFICADO das últimas 24 h vem
// junto mesmo fora delas: é o aviso que o sino fixa no topo (box.tsx), e com
// dezenas de avisos de fila por dia ele saía da lista antes de alguém ler.
const LATEST_LIMIT = 50;
const QUALIFIED_EXTRA_LIMIT = 20;

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json([], { status: 401 });
  }

  const recipientId = session.user.id;
  // As duas no índice (recipientId, createdAt); a 2ª só varre as 24 h da pessoa.
  const [latest, qualified] = await Promise.all([
    db.notification.findMany({
      where: { recipientId },
      orderBy: { createdAt: "desc" },
      take: LATEST_LIMIT,
    }),
    db.notification.findMany({
      where: {
        recipientId,
        createdAt: { gte: new Date(Date.now() - QUALIFIED_PIN_MS) },
        message: { contains: WA_QUALIFIED_MARK },
      },
      orderBy: { createdAt: "desc" },
      take: QUALIFIED_EXTRA_LIMIT,
    }),
  ]);

  return NextResponse.json(mergeBellNotifications(latest, qualified));
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { ids } = await request.json();

  if (ids === "all") {
    await db.notification.updateMany({
      where: { recipientId: session.user.id, read: false },
      data: { read: true },
    });
  } else if (Array.isArray(ids)) {
    await db.notification.updateMany({
      where: { id: { in: ids }, recipientId: session.user.id },
      data: { read: true },
    });
  }

  return NextResponse.json({ ok: true });
}

// Limpa as notificações do usuário logado (todas, ou só as informadas em ids).
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { ids } = await request.json().catch(() => ({ ids: "all" }));

  if (ids === "all") {
    await db.notification.deleteMany({
      where: { recipientId: session.user.id },
    });
  } else if (Array.isArray(ids)) {
    await db.notification.deleteMany({
      where: { id: { in: ids }, recipientId: session.user.id },
    });
  }

  return NextResponse.json({ ok: true });
}

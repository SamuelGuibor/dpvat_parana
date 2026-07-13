import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/_shared/lib/auth";
import { db } from "@/app/_shared/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json([], { status: 401 });
  }

  const notifications = await db.notification.findMany({
    where: { recipientId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json(notifications);
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

/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/_shared/lib/auth";
import { db } from "@/app/_shared/lib/prisma";

function fmt(date: Date): string {
  return date.toISOString().slice(0, 10).split("-").reverse().join("/");
}

/**
 * Verifica afastamentos vencidos (afastadoAte <= agora) que ainda não foram
 * notificados e gera uma notificação para cada admin. O flag afastadoNotificado
 * garante que cada vencimento gere notificação uma única vez (é resetado quando
 * a data de afastamento é alterada). Idempotente: pode ser chamado em loop.
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  try {
    const now = new Date();

    const [users, processes] = await Promise.all([
      db.user.findMany({
        where: { afastadoAte: { lte: now }, afastadoNotificado: false },
        select: { id: true, name: true, afastadoAte: true },
      }),
      db.process.findMany({
        where: { afastadoAte: { lte: now }, afastadoNotificado: false },
        select: { id: true, name: true, afastadoAte: true },
      }),
    ]);

    const vencidos = [
      ...users.map((u) => ({ ...u, isProcess: false })),
      ...processes.map((p) => ({ ...p, isProcess: true })),
    ];

    if (vencidos.length === 0) {
      return NextResponse.json({ created: 0, vencidos: 0 });
    }

    const admins = await db.user.findMany({
      where: { role: { startsWith: "ADMIN" } },
      select: { id: true },
    });

    if (admins.length > 0) {
      const notifications = vencidos.flatMap((card) =>
        admins.map((admin) => ({
          recipientId: admin.id,
          authorId: "system",
          authorName: "Sistema",
          message: `${card.name ?? "card"} venceu${card.afastadoAte ? ` em ${fmt(card.afastadoAte)}` : ""}.`,
          targetName: card.name ?? "",
          userId: card.isProcess ? null : card.id,
          processId: card.isProcess ? card.id : null,
        }))
      );
      await db.notification.createMany({ data: notifications });
    }

    // Marca como notificado para não repetir.
    await Promise.all([
      users.length > 0 &&
        db.user.updateMany({
          where: { id: { in: users.map((u) => u.id) } },
          data: { afastadoNotificado: true },
        }),
      processes.length > 0 &&
        db.process.updateMany({
          where: { id: { in: processes.map((p) => p.id) } },
          data: { afastadoNotificado: true },
        }),
    ]);

    return NextResponse.json({ created: admins.length * vencidos.length, vencidos: vencidos.length });
  } catch (error: any) {
    console.error("[AFASTAMENTOS CHECK]", error);
    return NextResponse.json({ error: "Erro ao verificar afastamentos" }, { status: 500 });
  }
}

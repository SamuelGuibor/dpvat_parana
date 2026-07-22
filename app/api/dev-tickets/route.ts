import { NextResponse } from "next/server";
import { db } from "@/app/_shared/lib/prisma";
import { getSessionPermissions } from "@/app/_shared/lib/permissions-server";

export async function GET() {
  // Clientes também têm sessão (middleware só exige login): tickets são
  // internos, então a lista fica restrita a quem tem a permissão da aba.
  const ctx = await getSessionPermissions();
  if (!ctx?.permissions.view_tickets) {
    return NextResponse.json([], { status: 401 });
  }

  // Mais antigos primeiro: a coluna "Em Distribuição" funciona como fila FIFO.
  const tickets = await db.devTicket.findMany({
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  return NextResponse.json(tickets);
}

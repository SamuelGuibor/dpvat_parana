import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/_shared/lib/auth";
import { db } from "@/app/_shared/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);

  // Clientes também têm sessão (middleware só exige login): tickets são
  // internos, então a lista fica restrita à equipe.
  if (!session?.user?.id || !session.user.role?.startsWith("ADMIN")) {
    return NextResponse.json([], { status: 401 });
  }

  // Mais antigos primeiro: a coluna "Em Distribuição" funciona como fila FIFO.
  const tickets = await db.devTicket.findMany({
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  return NextResponse.json(tickets);
}

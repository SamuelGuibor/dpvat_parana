import { db } from "@/app/_shared/lib/prisma";
import { noStoreJson, teamRoute } from "@/app/_shared/lib/route-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  // Clientes também têm sessão (middleware só exige login): o quadro é
  // interno. Cérebro APP: vê quem tem a aba de tickets OU usa a IA de operação
  // (o operador precisa ver o quadro para sugerir conhecimento).
  const auth = await teamRoute();
  if ("res" in auth) return auth.res;
  const { permissions } = auth.ctx;
  if (!permissions.view_tickets && !permissions.op_use) {
    return noStoreJson({ error: "Sem acesso ao quadro." }, { status: 403 });
  }

  // Mais antigos primeiro: a coluna "Em Distribuição" funciona como fila FIFO.
  const tickets = await db.devTicket.findMany({
    orderBy: { createdAt: "asc" },
    take: 500,
  });

  return noStoreJson(tickets);
}

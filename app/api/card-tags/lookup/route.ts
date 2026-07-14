import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_shared/lib/prisma";

// Tags de um lote de cards (o kanban chama junto com /api/card-counts).
// POST { userIds, processIds } → { users: { [id]: Tag[] }, processes: { [id]: Tag[] } }

export const dynamic = "force-dynamic";

type TagDTO = { id: string; name: string; color: string };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const userIds: string[] = Array.isArray(body.userIds) ? body.userIds.filter(Boolean) : [];
  const processIds: string[] = Array.isArray(body.processIds) ? body.processIds.filter(Boolean) : [];

  const result: { users: Record<string, TagDTO[]>; processes: Record<string, TagDTO[]> } = {
    users: {},
    processes: {},
  };

  const [users, processes] = await Promise.all([
    userIds.length
      ? db.user.findMany({
          where: { id: { in: userIds }, cardTags: { some: {} } },
          select: { id: true, cardTags: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" } } },
        })
      : Promise.resolve([]),
    processIds.length
      ? db.process.findMany({
          where: { id: { in: processIds }, cardTags: { some: {} } },
          select: { id: true, cardTags: { select: { id: true, name: true, color: true }, orderBy: { name: "asc" } } },
        })
      : Promise.resolve([]),
  ]);

  for (const u of users) result.users[u.id] = u.cardTags;
  for (const p of processes) result.processes[p.id] = p.cardTags;

  return NextResponse.json(result);
}

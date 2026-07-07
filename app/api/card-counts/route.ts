import { NextResponse } from "next/server";
import { db } from "../../_shared/lib/prisma";

type Body = {
  userIds?: string[];
  processIds?: string[];
};

type CountMap = Record<string, { comments: number; attachments: number }>;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const userIds = Array.isArray(body.userIds) ? body.userIds.filter(Boolean) : [];
    const processIds = Array.isArray(body.processIds) ? body.processIds.filter(Boolean) : [];

    const result: { users: CountMap; processes: CountMap } = {
      users: {},
      processes: {},
    };

    if (userIds.length > 0) {
      const [comments, documents] = await Promise.all([
        db.comment.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds } },
          _count: { _all: true },
        }),
        db.document.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds } },
          _count: { _all: true },
        }),
      ]);

      for (const id of userIds) {
        result.users[id] = { comments: 0, attachments: 0 };
      }
      for (const row of comments) {
        if (row.userId) result.users[row.userId].comments = row._count._all;
      }
      for (const row of documents) {
        if (row.userId) result.users[row.userId].attachments = row._count._all;
      }
    }

    if (processIds.length > 0) {
      const [comments, documents] = await Promise.all([
        db.comment.groupBy({
          by: ["processId"],
          where: { processId: { in: processIds } },
          _count: { _all: true },
        }),
        db.document.groupBy({
          by: ["processId"],
          where: { processId: { in: processIds } },
          _count: { _all: true },
        }),
      ]);

      for (const id of processIds) {
        result.processes[id] = { comments: 0, attachments: 0 };
      }
      for (const row of comments) {
        if (row.processId) result.processes[row.processId].comments = row._count._all;
      }
      for (const row of documents) {
        if (row.processId) result.processes[row.processId].attachments = row._count._all;
      }
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("[CARD-COUNTS][POST]", error);
    return NextResponse.json(
      { error: "Erro ao buscar contagens" },
      { status: 500 },
    );
  }
}

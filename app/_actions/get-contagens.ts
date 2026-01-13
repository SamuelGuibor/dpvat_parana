import { db } from "@/app/_lib/prisma";

export async function getEventsCount() {
  const data = await db.botconversa.groupBy({
    by: ['evento'],
    _count: {
      evento: true,
    },
  });

  return data.reduce<Record<string, number>>((acc, item) => {
    acc[item.evento] = item._count.evento;
    return acc;
  }, {});
}

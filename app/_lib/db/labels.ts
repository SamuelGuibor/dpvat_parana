import { db } from "@/app/_lib/prisma";

export async function fetchLabels() {
  return db.label.findMany({
    orderBy: { order: "asc" },
    select: { id: true, name: true, color: true, timeLimitDays: true, order: true },
  });
}

export async function fetchLabelByOrder(order: number) {
  return db.label.findFirst({ where: { order } });
}

export async function fetchLabelByName(name: string) {
  return db.label.findFirst({ where: { name } });
}

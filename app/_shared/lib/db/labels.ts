import { unstable_cache } from "next/cache";
import { db } from "@/app/_shared/lib/prisma";

// As colunas mudam poucas vezes por mês, mas eram re-consultadas no banco a
// cada tick de 7s de CADA usuário do board. Cache com tag: as rotas de
// escrita de label chamam revalidateTag("labels") e a invalidação é imediata.
export const fetchLabels = unstable_cache(
  async () =>
    db.label.findMany({
      orderBy: { order: "asc" },
      select: { id: true, name: true, color: true, timeLimitDays: true, order: true },
    }),
  ["labels-list"],
  { tags: ["labels"], revalidate: 300 },
);

export async function fetchLabelByOrder(order: number) {
  return db.label.findFirst({ where: { order } });
}

export async function fetchLabelByName(name: string) {
  return db.label.findFirst({ where: { name } });
}

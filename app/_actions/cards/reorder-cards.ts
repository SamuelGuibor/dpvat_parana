"use server";

import { Prisma } from "@prisma/client";
import { db } from "../../_shared/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../_shared/lib/auth";

interface ReorderCardsProps {
  // Cards da coluna na nova ordem (de cima para baixo). O índice vira o
  // boardOrder de cada um — reindexa a coluna inteira a cada drop, o que
  // também "cura" cards antigos que ainda não têm ordem definida.
  cards: { id: string; isProcess: boolean }[];
}

const MAX_CARDS_PER_REORDER = 1000;

export async function reorderCards({ cards }: ReorderCardsProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Não autenticado");

  if (!Array.isArray(cards) || cards.length === 0) return { success: true };
  if (cards.length > MAX_CARDS_PER_REORDER) {
    throw new Error("Coluna grande demais para reordenar");
  }

  const userIds: string[] = [];
  const userOrders: number[] = [];
  const processIds: string[] = [];
  const processOrders: number[] = [];
  cards.forEach((c, index) => {
    if (typeof c?.id !== "string") return;
    if (c.isProcess) {
      processIds.push(c.id);
      processOrders.push(index);
    } else {
      userIds.push(c.id);
      userOrders.push(index);
    }
  });

  // UMA query por tabela (unnest) em vez de um UPDATE por card — com banco
  // remoto, N round-trips por drop deixavam o board visivelmente lento.
  const queries: Prisma.PrismaPromise<unknown>[] = [];
  if (userIds.length) {
    queries.push(db.$executeRaw`
      UPDATE "User" AS u
      SET "boardOrder" = v.ord
      FROM (SELECT unnest(${userIds}::text[]) AS id, unnest(${userOrders}::int[]) AS ord) AS v
      WHERE u.id = v.id
    `);
  }
  if (processIds.length) {
    queries.push(db.$executeRaw`
      UPDATE "Process" AS p
      SET "boardOrder" = v.ord
      FROM (SELECT unnest(${processIds}::text[]) AS id, unnest(${processOrders}::int[]) AS ord) AS v
      WHERE p.id = v.id
    `);
  }
  if (queries.length) await db.$transaction(queries);

  return { success: true };
}

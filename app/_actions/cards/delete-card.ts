"use server";

import { db } from "../../_shared/lib/prisma";
import { revalidatePath } from "next/cache";
import { requirePermission } from "../../_shared/lib/permissions-server";

export async function deleteCard({
  id,
  isProcess,
}: {
  id: string;
  isProcess: boolean;
}) {
  await requirePermission("delete_cards");

  if (isProcess) {
    await db.process.delete({ where: { id } });
  } else {
    await db.user.delete({ where: { id } });
  }

  revalidatePath("/");
}
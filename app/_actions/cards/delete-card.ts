"use server";

import { db } from "../../_shared/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../_shared/lib/auth";
import { revalidatePath } from "next/cache";

export async function deleteCard({
  id,
  isProcess,
}: {
  id: string;
  isProcess: boolean;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) throw new Error("Não autenticado.");

  if (isProcess) {
    await db.process.delete({ where: { id } });
  } else {
    await db.user.delete({ where: { id } });
  }

  revalidatePath("/");
}
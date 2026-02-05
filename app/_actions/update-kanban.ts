"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";
import { revalidatePath } from "next/cache";

interface UpdateKanbanStatusProps {
  id: string;
  status: string;
  isProcess: boolean;
}

export async function updateKanbanStatus({
  id,
  status,
  isProcess,
}: UpdateKanbanStatusProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Não autenticado");
  }

  const now = new Date();

  if (isProcess) {
    await db.process.update({
      where: { id },
      data: {
        role: status,
        statusStartedAt: now,
      },
    });
    revalidatePath('/nova-dash')
  } else {
    await db.user.update({
      where: { id },
      data: {
        role: status,
        statusStartedAt: now,
      },
    });
    revalidatePath('/nova-dash')

  }
  return { success: true };
}

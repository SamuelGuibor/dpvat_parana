"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";
import { revalidatePath } from "next/cache";

interface UpdateKanbanStatusProps {
  id: string;
  labelId: string;
  isProcess: boolean;
}

export async function updateKanbanStatus({
  id,
  labelId,
  isProcess,
}: UpdateKanbanStatusProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Não autenticado");
  }

  const label = await db.label.findUnique({ where: { id: labelId } });
  if (!label) throw new Error("Etiqueta não encontrada");

  const now = new Date();
  const data = {
    labelId: label.id,
    role: label.name,
    statusStartedAt: now,
  };

  if (isProcess) {
    await db.process.update({ where: { id }, data });
  } else {
    await db.user.update({ where: { id }, data });
  }

  revalidatePath('/nova-dash');
  return { success: true };
}

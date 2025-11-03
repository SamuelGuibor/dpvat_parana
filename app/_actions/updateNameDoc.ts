"use server";

import { db } from "../_lib/prisma";

export async function updateDocumentName({
  id,
  newName,
}: {
  id: string;
  newName: string;
}) {
  if (!id || !newName.trim()) {
    throw new Error("ID ou nome inválido.");
  }

  const updated = await db.document.update({
    where: { id },
    data: { name: newName.trim() },
    select: { id: true, name: true },
  });

  return updated;
}

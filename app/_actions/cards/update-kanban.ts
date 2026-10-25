"use server";

import { requireTeamWrite } from "@/app/_shared/lib/permissions-server";
import { moveCardToLabel } from "@/app/_shared/lib/cards/move-card";

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
  const ctx = await requireTeamWrite();

  // Grava a coluna, o log `move` (com await) e dispara as automações da coluna
  // depois da resposta (app/_shared/lib/cards/move-card.ts). Mesma coluna = noop.
  await moveCardToLabel({
    cardId: id,
    isProcess,
    labelId,
    author: { id: ctx.userId, name: ctx.name ?? "Usuário" },
  });

  // Sem revalidatePath aqui: /nova-dash é 100% client e sincroniza por
  // polling; revalidar a rota re-renderizava a página inteira a cada drop.
  return { success: true };
}

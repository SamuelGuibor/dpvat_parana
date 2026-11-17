"use server";

import { requireTeamWrite } from "@/app/_shared/lib/permissions-server";
import { moveCardToLabel } from "@/app/_shared/lib/cards/move-card";
import { CardWriteError } from "@/app/_shared/lib/cards/types";

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
  try {
    await moveCardToLabel({
      cardId: id,
      isProcess,
      labelId,
      author: { id: ctx.userId, name: ctx.name ?? "Usuário" },
    });
  } catch (err) {
    // Trava aceite × ZapSign (T-B40K0): DEVOLVE o motivo — erro lançado por
    // server action chega mascarado em produção e o board só diria "Erro ao
    // mover card".
    if (err instanceof CardWriteError && (err.code === "falta_aceite" || err.code === "falta_zapsign")) {
      return { success: false as const, code: err.code, error: err.message };
    }
    throw err;
  }

  // Sem revalidatePath aqui: /nova-dash é 100% client e sincroniza por
  // polling; revalidar a rota re-renderizava a página inteira a cada drop.
  return { success: true as const };
}

"use server";

import { db } from "../../_shared/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../_shared/lib/auth";
import { runAutomations } from "../../_shared/lib/automation-executor";
import { createLog } from "../../_shared/lib/log";
import { reportCriticalError } from "../../_shared/lib/report-error";

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

  // Coluna de origem (o `role` guarda o nome da etiqueta/coluna atual) para o log.
  const current = isProcess
    ? await db.process.findUnique({ where: { id }, select: { role: true, name: true, service: true } })
    : await db.user.findUnique({ where: { id }, select: { role: true, name: true, service: true } });
  const fromColumn = current?.role ?? null;

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

  // Só registra se a coluna realmente mudou.
  if (fromColumn !== label.name) {
    await createLog({
      action: "move",
      message: fromColumn
        ? `moveu de "${fromColumn}" para "${label.name}"`
        : `moveu para "${label.name}"`,
      authorId: session.user.id,
      authorName: session.user.name ?? "Usuário",
      userId: isProcess ? null : id,
      processId: isProcess ? id : null,
      metadata: {
        from: fromColumn,
        to: label.name,
        cardName: current?.name ?? null,
        service: current?.service ?? null,
      },
    });
  }

  // Dispara automações de forma assíncrona (sem bloquear o retorno)
  runAutomations({
    cardId: id,
    isProcess,
    newLabelId: label.id,
    authorId: session.user.id,
    authorName: session.user.name ?? "Usuário",
  }).catch((err) => reportCriticalError("AUTOMATION", err));

  // Sem revalidatePath aqui: /nova-dash é 100% client e sincroniza por
  // polling; revalidar a rota re-renderizava a página inteira a cada drop.
  return { success: true };
}

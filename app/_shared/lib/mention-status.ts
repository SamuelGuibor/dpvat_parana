// Estado de uma menção/tarefa da Caixa de Menções para um destinatário
// explícito (a IA de operação não tem sessão do site). Mesma regra do
// setMentionStatus (app/_actions/mentions/mention-actions.ts): só a cópia do
// próprio destinatário; tarefa de setor (groupId) muda para o grupo todo.

import { db } from "./prisma";

export type MentionTarget = "ACK" | "DONE";

export async function setMentionStatusFor(recipientId: string, id: string, status: MentionTarget): Promise<{ noop: boolean; setor: boolean }> {
  const mine = await db.mention.findFirst({
    where: { id, recipientId },
    select: { status: true, ackAt: true, groupId: true },
  });
  if (!mine) throw new Error("menção não encontrada");
  if (mine.status === status || (status === "ACK" && mine.status === "DONE")) return { noop: true, setor: !!mine.groupId };
  const where = mine.groupId ? { groupId: mine.groupId } : { id, recipientId };
  const now = new Date();
  await db.mention.updateMany({
    where,
    data: status === "ACK" ? { status, ackAt: now, doneAt: null } : { status, ackAt: mine.ackAt ?? now, doneAt: now },
  });
  return { noop: false, setor: !!mine.groupId };
}

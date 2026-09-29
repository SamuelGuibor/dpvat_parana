import { db } from "@/app/_shared/lib/prisma";
import { TEAM_ROLES } from "@/app/_shared/lib/permissions";
import { reportCriticalError } from "@/app/_shared/lib/report-error";
import { humanHoldMs, pickOwner } from "@/app/_shared/utils/ownership";

// Dono pegajoso (auditoria de 24/09/2026, EF-1): quem é o atendente da
// conversa quando ela volta do bot. Sem "use server" de propósito: é chamado
// pela ingestão, pelo bot, pelo cron e pelas actions, nunca pelo navegador.
// Regras puras (janela, escolha do dono, veredito do cron) em
// app/_shared/utils/ownership.ts.

/** Janela do dono pegajoso (env WA_HUMAN_HOLD_DAYS; 7 dias sem a env, 0 desliga). */
export const HUMAN_HOLD_MS = humanHoldMs(process.env.WA_HUMAN_HOLD_DAYS);
/** Interruptor: desligado, devolver/reabrir/transferir voltam a soltar o atendente. */
export const STICKY_OWNER_ENABLED = HUMAN_HOLD_MS > 0;

const TEAM_ROLE_LIST: string[] = [...TEAM_ROLES];

export interface ConversationOwner {
  id: string;
  name: string | null;
}

async function teamMember(userId: string): Promise<ConversationOwner | null> {
  return db.user.findFirst({
    where: { id: userId, role: { in: TEAM_ROLE_LIST } },
    select: { id: true, name: true },
  });
}

/**
 * Dono da conversa com o nome (para a nota interna "volta para <nome>").
 * `currentAssignee` = assignedToId atual; vale se ainda for da equipe. Senão, o
 * autor da última mensagem humana (atendente pelo CRM, fora nota interna e bot)
 * dos últimos `lookbackMs`, se ainda for da equipe. A equipe é conferida no
 * banco (role ADMIN*), não no JWT. Janela 0 (interruptor desligado) = null.
 * Mensagem mandada pelo celular (sem authorId) não define dono.
 */
export async function findConversationOwner(
  contactId: string,
  currentAssignee?: string | null,
  lookbackMs: number = HUMAN_HOLD_MS,
): Promise<ConversationOwner | null> {
  if (lookbackMs <= 0) return null;
  // As duas leituras em paralelo: na maioria das chamadas o atribuído ainda é
  // da equipe e a busca da mensagem nem é usada, mas não custa uma ida a mais.
  const [assignee, lastHuman] = await Promise.all([
    currentAssignee ? teamMember(currentAssignee) : Promise.resolve(null),
    db.whatsAppMessage.findFirst({
      // Índice [contactId, createdAt] de whatsapp_messages.
      where: {
        contactId,
        direction: "out",
        sentByBot: false,
        authorId: { not: null },
        internal: false,
        deletedAt: null,
        createdAt: { gte: new Date(Date.now() - lookbackMs) },
      },
      orderBy: { createdAt: "desc" },
      select: { authorId: true },
    }),
  ]);
  const author = !assignee && lastHuman?.authorId ? await teamMember(lastHuman.authorId) : null;
  const team = [assignee, author].filter((u): u is ConversationOwner => !!u);
  const ownerId = pickOwner(currentAssignee ?? null, lastHuman?.authorId ?? null, new Set(team.map((u) => u.id)));
  return team.find((u) => u.id === ownerId) ?? null;
}

/**
 * Só o id do dono (assignedToId a gravar); null = sem dono. Nunca lança: roda
 * dentro da ingestão do webhook (erro aqui virava HTTP 500 e reentrega da
 * Meta) e do alerta de entrega. Na falha a conversa segue sem dono, como era
 * antes do dono pegajoso, e o erro vai para o Log critical_error.
 */
export async function resolveConversationOwner(
  contactId: string,
  currentAssignee?: string | null,
  lookbackMs: number = HUMAN_HOLD_MS,
): Promise<string | null> {
  try {
    return (await findConversationOwner(contactId, currentAssignee, lookbackMs))?.id ?? null;
  } catch (err) {
    await reportCriticalError("WHATSAPP dono da conversa", err, { contactId });
    return null;
  }
}

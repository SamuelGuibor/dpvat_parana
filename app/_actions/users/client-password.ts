"use server";

import { db } from "../../_shared/lib/prisma";
import { requireTeam } from "../../_shared/lib/permissions-server";
import { hashPassword, isHashedPassword } from "../../_shared/lib/password";
import { createLog } from "../../_shared/lib/log";

// Senha de ACESSO do cliente (login da área do cliente por CPF+senha).
// A equipe pode consultá-la para informar ao cliente por telefone — cada
// visualização fica registrada no histórico do card (auditoria).
//
// Senhas novas/redefinidas são gravadas com hash bcrypt e NÃO podem mais ser
// exibidas — nesses casos a tela oferece "definir nova senha". Senhas legadas
// em texto puro (anteriores ao hardening) ainda são exibíveis.

async function resolveOwnerUserId(cardId: string, isProcess: boolean): Promise<string | null> {
  if (!isProcess) return cardId;
  const proc = await db.process.findUnique({ where: { id: cardId }, select: { userId: true } });
  return proc?.userId ?? null;
}

export interface ClientPasswordInfo {
  /** true = já está com hash (não dá para exibir); false = legado em texto puro. */
  hashed: boolean;
  /** A senha em texto, quando ainda for legada. */
  password: string | null;
  hasPassword: boolean;
}

export async function getClientAccessPassword(
  cardId: string,
  isProcess: boolean,
): Promise<ClientPasswordInfo> {
  const ctx = await requireTeam();

  const userId = await resolveOwnerUserId(cardId, isProcess);
  if (!userId) throw new Error("Cliente do card não encontrado.");

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { password: true, name: true },
  });
  if (!user) throw new Error("Cliente não encontrado.");

  const stored = user.password ?? "";
  const hashed = stored ? isHashedPassword(stored) : false;

  // Toda visualização fica no histórico do card.
  await createLog({
    action: "password_view",
    message: "visualizou a senha de acesso do cliente",
    authorId: ctx.userId,
    authorName: ctx.name ?? "Usuário",
    userId: isProcess ? null : cardId,
    processId: isProcess ? cardId : null,
    metadata: { hashed, cardName: user.name ?? null },
  });

  return {
    hashed,
    password: !hashed && stored ? stored : null,
    hasPassword: Boolean(stored),
  };
}

export async function setClientAccessPassword(
  cardId: string,
  isProcess: boolean,
  newPassword: string,
): Promise<{ success: true }> {
  const ctx = await requireTeam();

  if ((newPassword ?? "").length < 7) {
    throw new Error("A senha precisa ter pelo menos 7 caracteres.");
  }

  const userId = await resolveOwnerUserId(cardId, isProcess);
  if (!userId) throw new Error("Cliente do card não encontrado.");

  await db.user.update({
    where: { id: userId },
    data: { password: await hashPassword(newPassword) },
  });

  await createLog({
    action: "password_set",
    message: "redefiniu a senha de acesso do cliente",
    authorId: ctx.userId,
    authorName: ctx.name ?? "Usuário",
    userId: isProcess ? null : cardId,
    processId: isProcess ? cardId : null,
  });

  return { success: true };
}

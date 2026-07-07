"use server";

import { db } from "../../_shared/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../../_shared/lib/auth";

/** Dados do perfil do próprio usuário logado. */
export async function getMyProfile() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Não autenticado.");

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      telefone: true,
      cpf: true,
      role: true,
      image: true,
      createdAt: true,
    },
  });

  if (!user) throw new Error("Usuário não encontrado.");

  return {
    id: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    telefone: user.telefone ?? "",
    cpf: user.cpf ?? "",
    role: user.role ?? "",
    image: user.image ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

interface UpdateProfileInput {
  name?: string;
  email?: string;
  telefone?: string;
  currentPassword?: string;
  newPassword?: string;
}

/**
 * Atualiza os dados do PRÓPRIO usuário logado.
 *
 * Segurança: só opera sobre `session.user.id` — o usuário nunca consegue
 * editar outra pessoa por aqui. A troca de senha é opcional e exige a senha
 * atual correta.
 */
export async function updateMyProfile(data: UpdateProfileInput) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) throw new Error("Não autenticado.");

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, password: true },
  });
  if (!me) throw new Error("Usuário não encontrado.");

  // Troca de senha (opcional).
  let passwordUpdate: string | undefined;
  if (data.newPassword) {
    if (!data.currentPassword) {
      throw new Error("Informe a senha atual para poder alterá-la.");
    }
    if (me.password && me.password !== data.currentPassword) {
      throw new Error("A senha atual está incorreta.");
    }
    if (data.newPassword.length < 4) {
      throw new Error("A nova senha deve ter ao menos 4 caracteres.");
    }
    passwordUpdate = data.newPassword;
  }

  // E-mail é único: valida antes para dar um erro amigável.
  const email = data.email?.trim();
  if (email) {
    const existing = await db.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing && existing.id !== me.id) {
      throw new Error("Este e-mail já está em uso por outro usuário.");
    }
  }

  try {
    const updated = await db.user.update({
      where: { id: me.id },
      data: {
        name: data.name?.trim() || undefined,
        email: email || undefined,
        telefone: data.telefone ?? undefined,
        password: passwordUpdate,
      },
      select: {
        id: true,
        name: true,
        email: true,
        telefone: true,
        role: true,
        image: true,
      },
    });

    return {
      id: updated.id,
      name: updated.name ?? "",
      email: updated.email ?? "",
      telefone: updated.telefone ?? "",
      role: updated.role ?? "",
      image: updated.image ?? null,
    };
  } catch (error) {
    console.error("Erro ao atualizar perfil:", error);
    throw new Error("Não foi possível salvar seu perfil.");
  }
}

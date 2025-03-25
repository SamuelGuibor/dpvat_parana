"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";

interface UserProfile {
  cpf: string;
  data_nasc: string;
  rua: string;
  bairro: string;
  numero: string;
  cep: string;
}

export async function updateUserProfile(data: UserProfile) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado.");
  }

  await db.user.update({
    where: { email: session.user.email },
    data,
  });

  return { message: "Perfil atualizado com sucesso!" };
}

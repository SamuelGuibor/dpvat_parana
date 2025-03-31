"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";

export async function checkUserCpf() {
  const session = await getServerSession(authOptions);
  // if (!session?.user?.email) {
  //   throw new Error("Usuário não autenticado");
  // }

  const user = await db.user.findUnique({
    where: { email: session?.user.email },
    select: { cpf: true },
  });

  return user;
}

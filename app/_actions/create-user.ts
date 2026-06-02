"use server";

import { db } from "../_lib/prisma";

interface CreateUserProps {
  name: string;
  cpf: string;
  password: string;
  email?: string;
  labelId?: string;
  role?: string;
}

export const createUser = async ({ name, cpf, password, email, labelId, role }: CreateUserProps) => {
  const finalEmail = email?.trim() || `${cpf}@inserir-email.com`;

  const finalLabelId = labelId || (
    await db.label.findFirst({ orderBy: { order: "asc" }, select: { id: true } })
  )?.id;

  const user = await db.user.create({
    data: {
      name,
      email: finalEmail,
      cpf,
      password,
      role,
      labelId: finalLabelId,
    },
  });

  return { id: user.id, name: user.name, email: user.email, cpf: user.cpf, role: user.role, labelId: user.labelId };
};
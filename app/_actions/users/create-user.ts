"use server";

import { db } from "../../_shared/lib/prisma";

interface CreateUserProps {
  name: string;
  cpf: string;
  password: string;
  email?: string;
  labelId?: string;
  role?: string;
  senha_inss?: string;
}

async function nextCardNumber(): Promise<number> {
  const rows = await db.$queryRawUnsafe<{ nextval: bigint }[]>(`SELECT nextval('card_number_seq') AS nextval`);
  return Number(rows[0].nextval);
}

export const createUser = async ({ name, cpf, password, email, labelId, role, senha_inss }: CreateUserProps) => {
  const finalEmail = email?.trim() || `${cpf}@inserir-email.com`;

  const isAdmin = role === 'ADMIN' || role === 'ADMIN+' || role === 'ADMIN++';
  const finalLabelId = isAdmin ? null : (
    labelId || (
      await db.label.findFirst({ orderBy: { order: "asc" }, select: { id: true } })
    )?.id
  );

  const cardNumber = await nextCardNumber();

  const user = await db.user.create({
    data: {
      name,
      email: finalEmail,
      cpf,
      password,
      role,
      labelId: finalLabelId,
      senha_inss,
      cardNumber,
    },
  });

  return { id: user.id, name: user.name, email: user.email, cpf: user.cpf, role: user.role, labelId: user.labelId, cardNumber: user.cardNumber };
};
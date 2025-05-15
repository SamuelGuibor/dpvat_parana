"use server";

import { db } from "../_lib/prisma";

interface CreateUserProps {
  name: string;
  email: string;
  password: string;
}

export const createUser = async ({ name, email, password }: CreateUserProps) => {
  const user = await db.user.create({
    data: {
      name,
      email,
      password, 
    },
  });

  return { id: user.id, name: user.name, email: user.email, role: user.role };
};
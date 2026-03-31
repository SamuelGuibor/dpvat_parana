"use server";

import { db } from "../_lib/prisma";

interface CreateUserProps {
  name: string;
  email: string;
  password: string;
  role: string
}

export const createUser = async ({ name, email, password, role }: CreateUserProps) => {
  const user = await db.user.create({
    data: {
      name,
      email,
      password, 
      role
    },
  });

  return { id: user.id, name: user.name, email: user.email, role: user.role };
};
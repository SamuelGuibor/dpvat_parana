"use server";

import bcrypt from "bcryptjs";
import { db } from "../_lib/prisma";
import { FormSchema } from "../login/sections/login-page";

export const createUser = async (data: FormSchema) => {
  const hashedPassword = await bcrypt.hash(data.password, 12);
  const user = await db.user.create({
    data: {
      name: data.name,
      email: data.email,
      password: hashedPassword,
    },
  });
  return user;
};

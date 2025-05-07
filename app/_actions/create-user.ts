"use server"

import { db } from "../_lib/prisma"
interface CreateUserProps {
  name: string
  email: string
  password: string
}

export const createUser = async ({ name, email, password }: CreateUserProps) => {
  await db.user.create({
    data: {
      name,
      email,
      password,
    },
  })
}
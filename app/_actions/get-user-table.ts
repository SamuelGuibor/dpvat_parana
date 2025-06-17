/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";

interface UserTableData {
  id: string;
  name: string;
  service: string;
  obs: string;
  statusStartedAt: string | null;
}

export async function getUserTable(): Promise<UserTableData[]> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    throw new Error("Usuário não autenticado.");
  }

  const users = await db.user.findMany({
    select: {
      id: true,
      name: true,
      service: true,
      obs: true,
      statusStartedAt: true,
    },
  });

  return users.map((user) => {
    console.log(`Usuário: ${user.name}, statusStartedAt: ${user.statusStartedAt}`);
    return {
      id: user.id,
      name: user.name || "",
      service: user.service || "",
      obs: user.obs || "",
      statusStartedAt: user.statusStartedAt ? user.statusStartedAt.toISOString() : null,
    };
  });
}
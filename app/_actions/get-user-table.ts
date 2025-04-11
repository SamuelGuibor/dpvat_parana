/* eslint-disable no-unused-vars */
/* eslint-disable @typescript-eslint/no-unused-vars */
"use server";

import { db } from "../_lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "../_lib/auth";

interface UserTableData {
  id: string;
  name: string; 
  status: string; 
  type: string;   
}

export async function getUserTable(): Promise<UserTableData[]> {
    const session = await getServerSession(authOptions);
  
    if (!session?.user?.email) {
      throw new Error("Usuário não autenticado.");
    }
  
    const users = await db.user.findMany({
      select: {
        id: true,
        name: true, // Ensure this matches your Prisma schema
        status: true,
        role: true,
      },
    });
  
    return users.map((user) => ({
      id: user.id,
      name: user.name || "Sem nome", // Use "name" here
      status: user.status || "Sem status",
      type: user.role || "USER",
    }));
  }
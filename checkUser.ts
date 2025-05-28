// scripts/checkUser.ts
import { db } from "@/app/_lib/prisma";

async function checkUser() {
  const user = await db.user.findFirst({ where: { name: "Samuel Guibor" } });
  console.log("Usuário no banco:", user);
}

checkUser();
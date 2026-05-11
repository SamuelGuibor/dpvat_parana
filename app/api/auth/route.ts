import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_lib/prisma";
import jwt from "jsonwebtoken";

export async function POST(req: NextRequest) {
  const { cpf, password } = await req.json();

  if (!cpf || !password) {
    return NextResponse.json(
      { error: "CPF e senha são obrigatórios" },
      { status: 400 }
    );
  }

  const user = await db.user.findFirst({
    where: { cpf, password },
    select: { id: true, email: true, name: true, role: true, password: true },
  });

  if (!user || !user.password) {
    return NextResponse.json(
      { error: "Usuário não encontrado ou senha inválida" },
      { status: 401 }
    );
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    process.env.NEXT_AUTH_SECRET as string,
    { expiresIn: "7d" }
  );

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    accessToken: token,
  });
}
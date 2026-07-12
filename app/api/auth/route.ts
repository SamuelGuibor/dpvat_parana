import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/_shared/lib/prisma";
import jwt from "jsonwebtoken";
import { verifyPassword, hashPassword } from "@/app/_shared/lib/password";
import { rateLimit } from "@/app/_shared/lib/rate-limit";

// Login legado que emite um JWT próprio (fora do NextAuth). Mesmas regras do
// authorize(): senha em hash bcrypt (aceitando legado em texto puro com
// re-hash no primeiro login) e rate limiting contra força-bruta.

export async function POST(req: NextRequest) {
  const { cpf, password } = await req.json();

  if (!cpf || !password) {
    return NextResponse.json(
      { error: "CPF e senha são obrigatórios" },
      { status: 400 }
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const windowMs = 15 * 60_000;
  if (!rateLimit(`login:ip:${ip}`, 10, windowMs) || !rateLimit(`login:cpf:${cpf}`, 5, windowMs)) {
    return NextResponse.json(
      { error: "Muitas tentativas de login. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    );
  }

  const candidates = await db.user.findMany({
    where: { cpf, password: { not: null } },
    select: { id: true, email: true, name: true, role: true, password: true },
    take: 10,
  });

  for (const user of candidates) {
    if (!user.password) continue;
    const { ok, needsRehash } = await verifyPassword(password, user.password);
    if (!ok) continue;

    if (needsRehash) {
      const newHash = await hashPassword(password);
      await db.user
        .update({ where: { id: user.id }, data: { password: newHash } })
        .catch((err) => console.error("[AUTH] Falha ao re-hashear senha legada:", err));
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

  return NextResponse.json(
    { error: "Usuário não encontrado ou senha inválida" },
    { status: 401 }
  );
}

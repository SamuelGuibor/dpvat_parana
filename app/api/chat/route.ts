import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/_shared/lib/auth";
import { handleChat } from "./modules/chat.service";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { pergunta } = await req.json();

  if (!pergunta || typeof pergunta !== "string") {
    return NextResponse.json({ error: "Pergunta é obrigatória" }, { status: 400 });
  }

  try {
    const resposta = await handleChat(
      pergunta,
      session.user.id,
      session.user.name ?? "Usuário",
      session.user.role ?? "USER"
    );
    return NextResponse.json({ resposta });
  } catch (err) {
    console.error("Erro no chat:", err);
    return NextResponse.json({ error: "Erro ao processar pergunta" }, { status: 500 });
  }
}

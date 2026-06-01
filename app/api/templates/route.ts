import { NextResponse } from "next/server";
import { listarTemplates } from "@/app/_utils/gerarDocumento";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const categoria = searchParams.get("categoria") as
    | "procuracoes"
    | "roteiros"
    | null;

  if (!categoria || !["procuracoes", "roteiros"].includes(categoria)) {
    return NextResponse.json(
      { error: "Categoria inválida. Use: procuracoes ou roteiros" },
      { status: 400 }
    );
  }

  const templates = listarTemplates(categoria);

  return NextResponse.json(templates);
}

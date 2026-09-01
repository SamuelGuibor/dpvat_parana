import { NextResponse } from "next/server";
import { listVisibleDocTemplates } from "@/app/_shared/lib/doc-templates";

// Lista de modelos do "Gerar Procuração": pasta templates/ do repositório +
// modelos enviados pela equipe (tabela doc_templates), menos os ocultados.
// Variantes internas da assinatura eletrônica nunca aparecem aqui (moram em
// templates-assinatura/ e o merge filtra "ASSINATURA" no nome).
export const dynamic = "force-dynamic";

export async function GET() {
  const templates = (await listVisibleDocTemplates()).map((t) => ({
    filename: t.filename,
    label: t.label,
  }));
  return NextResponse.json(templates);
}

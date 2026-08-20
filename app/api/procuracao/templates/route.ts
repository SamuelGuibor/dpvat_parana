import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export async function GET() {
  const templatesDir = path.join(process.cwd(), "templates");
  // Variantes internas da assinatura eletrônica moram em templates-assinatura/;
  // o filtro extra garante que uma cópia perdida aqui nunca aparece no front.
  const files = fs
    .readdirSync(templatesDir)
    .filter((f) => f.endsWith(".docx") && !f.toUpperCase().includes("ASSINATURA"));

  const templates = files.map((filename) => ({
    filename,
    label: filename.replace(".docx", ""),
  }));

  return NextResponse.json(templates);
}

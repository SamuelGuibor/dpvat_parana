import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

export async function GET() {
  const templatesDir = path.join(process.cwd(), "templates");
  const files = fs.readdirSync(templatesDir).filter((f) => f.endsWith(".docx"));

  const templates = files.map((filename) => ({
    filename,
    label: filename.replace(".docx", ""),
  }));

  return NextResponse.json(templates);
}

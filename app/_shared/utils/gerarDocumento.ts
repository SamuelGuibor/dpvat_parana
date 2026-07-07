/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

interface GerarDocumentoOptions {
  template: string;
  categoria?: "procuracoes" | "roteiros";
  dados: Record<string, string>;
}

export async function gerarDocumento({
  template,
  categoria = "roteiros",
  dados,
}: GerarDocumentoOptions): Promise<Buffer> {
  const basePath =
    categoria === "roteiros"
      ? path.join(process.cwd(), "templates", "roteiros", template)
      : path.join(process.cwd(), "templates", template);

  if (!fs.existsSync(basePath)) {
    throw new Error(`Template "${template}" não encontrado`);
  }

  const content = fs.readFileSync(basePath, "binary");
  const zip = new PizZip(content);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: {
      start: "<<",
      end: ">>",
    },
  });

  doc.render(dados);

  const buffer = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  return buffer;
}

export function listarTemplates(categoria: "procuracoes" | "roteiros") {
  const dir =
    categoria === "roteiros"
      ? path.join(process.cwd(), "templates", "roteiros")
      : path.join(process.cwd(), "templates");

  if (!fs.existsSync(dir)) {
    return [];
  }

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".docx"));

  return files.map((filename) => ({
    filename,
    label: filename.replace(".docx", ""),
  }));
}

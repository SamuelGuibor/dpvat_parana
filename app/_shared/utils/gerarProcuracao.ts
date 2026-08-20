/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export async function gerarProcuracao(
  dados: any,
  template?: string,
  // Os templates da ASSINATURA ELETRÔNICA (variantes com âncora) moram em
  // templates-assinatura/ — fora de templates/, que é listada no front
  // (/api/procuracao/templates) e não deve exibir as variantes internas.
  baseDir: "templates" | "templates-assinatura" = "templates",
) {
  const filename = template || "procuracao.docx";
  const templatePath = path.join(
    process.cwd(),
    baseDir,
    filename
  );

  const content = fs.readFileSync(templatePath, "binary");

  const zip = new PizZip(content);

    const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: {
            start: "[[",
            end: "]]",
        },
    });

  // Injeta dados
  doc.render(dados);

  // Gera arquivo
  const buffer = doc.getZip().generate({
    type: "nodebuffer",
    compression: "DEFLATE",
  });


  return buffer;

}

/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

export async function gerarProcuracao(
  dados: any,
) {
  // Caminho do template
  const templatePath = path.join(
    process.cwd(),
    "templates",
    "procuracao.docx"
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

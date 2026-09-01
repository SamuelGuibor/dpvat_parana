/* eslint-disable @typescript-eslint/no-explicit-any */
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { loadDocTemplateBuffer } from "@/app/_shared/lib/doc-templates";

export async function gerarProcuracao(
  dados: any,
  template?: string,
  // Os templates da ASSINATURA ELETRÔNICA (variantes com âncora) moram em
  // templates-assinatura/ — fora de templates/, que é listada no front
  // (/api/procuracao/templates) e não deve exibir as variantes internas.
  baseDir: "templates" | "templates-assinatura" = "templates",
) {
  const filename = template || "procuracao.docx";
  // Os dois grupos agora são gerenciáveis: um modelo enviado pela equipe vive
  // no S3 (tabela doc_templates) e loadDocTemplateBuffer resolve S3-ou-disco
  // — para templates/ (procuração) e templates-assinatura/ (KIT do bot).
  const content = await loadDocTemplateBuffer(
    filename,
    baseDir === "templates-assinatura" ? "assinatura" : "procuracao",
  );

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

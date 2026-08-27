// Smoke test do Gerador de Documento (IA) — partes puras (sem DOM/rede):
//   • readTemplate: extrai tags {{ }} e [[ ]] de um .docx;
//   • fillTemplate: preenche os dois estilos de delimitador no mesmo arquivo;
//   • isIaTag: convenção da tag de IA;
//   • buildScannedDocx / buildScannedPdf: remontagem das páginas escaneadas.

import { describe, expect, it } from "vitest";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import {
  buildScannedDocx, buildScannedPdf, fillTemplate, isIaTag, readTemplate,
} from "@/app/nova-dash/card-dialog/doc-ia/scan-utils";

/** Monta um .docx mínimo com o texto dado no corpo. */
function makeDocx(text: string): ArrayBuffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body><w:p><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p></w:body>
</w:document>`
  );
  const u8 = zip.generate({ type: "uint8array" }) as Uint8Array;
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

// JPEG 1×1 válido (o embedJpg do pdf-lib parseia os headers de verdade).
const TINY_JPEG_B64 =
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==";

describe("doc-ia scan-utils", () => {
  it("readTemplate acha tags dos dois estilos, sem duplicar", () => {
    const bytes = makeDocx("Olá {{name}}, CPF [[cpf]]. Resumo: {{IA}}. De novo: {{name}}");
    const info = readTemplate(bytes);
    expect(info.tags).toEqual(["name", "IA", "cpf"]);
    expect(info.styles.sort()).toEqual(["curly", "square"]);
  });

  it("isIaTag segue a convenção", () => {
    for (const ok of ["IA", "ia", "IA2", "IA_resumo", "ia-parecer"]) {
      expect(isIaTag(ok), ok).toBe(true);
    }
    for (const nok of ["name", "diaria", "iate", "media"]) {
      expect(isIaTag(nok), nok).toBe(false);
    }
  });

  it("fillTemplate preenche {{ }} e [[ ]] no mesmo documento", async () => {
    const bytes = makeDocx("Olá {{name}}, CPF [[cpf]]. Resumo: {{IA}}");
    const info = readTemplate(bytes);
    const blob = fillTemplate(bytes, { name: "Maria", cpf: "123", IA: "Texto gerado." }, info.styles);
    const out = new PizZip(await blob.arrayBuffer());
    const doc = new Docxtemplater(out, { delimiters: { start: "", end: "" } });
    const text = doc.getFullText();
    expect(text).toContain("Olá Maria, CPF 123. Resumo: Texto gerado.");
    expect(text).not.toContain("{{");
    expect(text).not.toContain("[[");
  });

  it("buildScannedDocx monta um pacote OOXML consistente", async () => {
    const pages = [
      { jpegBase64: TINY_JPEG_B64, widthPx: 1240, heightPx: 1754 },
      { jpegBase64: TINY_JPEG_B64, widthPx: 1240, heightPx: 1754 },
    ];
    const blob = buildScannedDocx(pages, "teste");
    const zip = new PizZip(await blob.arrayBuffer());
    expect(zip.file("word/document.xml")).toBeTruthy();
    expect(zip.file("word/media/page1.jpeg")).toBeTruthy();
    expect(zip.file("word/media/page2.jpeg")).toBeTruthy();
    const xml = zip.file("word/document.xml")!.asText();
    expect(xml).toContain('r:embed="rImg1"');
    expect(xml).toContain('r:embed="rImg2"');
    expect(xml).toContain('<w:br w:type="page"/>');
    const rels = zip.file("word/_rels/document.xml.rels")!.asText();
    expect(rels).toContain('Target="media/page2.jpeg"');
  });

  it("buildScannedPdf gera um PDF com uma página por imagem", async () => {
    const pages = [{ jpegBase64: TINY_JPEG_B64, widthPx: 100, heightPx: 141 }];
    const blob = await buildScannedPdf(pages);
    const bytes = Buffer.from(await blob.arrayBuffer());
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

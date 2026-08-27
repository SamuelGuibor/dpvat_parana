/* eslint-disable @typescript-eslint/no-explicit-any */
// Utilidades CLIENT-SIDE do Gerador de Documento (IA):
//   • extração de tags e preenchimento do .docx (docxtemplater no navegador);
//   • efeito "digitalizado": rasteriza o PDF (pdfjs), aplica ruído/rotação/
//     contraste de scanner em canvas e remonta PDF (pdf-lib) ou DOCX (pizzip
//     com uma imagem de página inteira por página).
//
// Tudo roda no browser de propósito: evita o limite de 4.5MB de payload da
// Vercel — o servidor só participa na conversão DOCX→PDF (proxy do LibreOffice).

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { PDFDocument } from "pdf-lib";

/**
 * Bytes → Blob.
 *
 * Existe por causa da tipagem: nas libs novas do TypeScript o Uint8Array é
 * genérico (`Uint8Array<ArrayBufferLike>`) e o buffer por baixo pode ser um
 * SharedArrayBuffer, que não serve como `BlobPart`. Um ArrayBuffer comum é
 * aceito em qualquer versão, então convertemos antes.
 *
 * O `slice()` é de propósito: devolve um buffer do tamanho EXATO dos bytes.
 * Usar `.buffer` direto arrastaria o resto do buffer quando a view for parcial
 * — o arquivo sairia com lixo no fim.
 */
export function bytesParaBlob(bytes: Uint8Array | ArrayBuffer, type: string): Blob {
  const buffer: ArrayBuffer =
    bytes instanceof Uint8Array ? (bytes.slice().buffer as ArrayBuffer) : bytes;
  return new Blob([buffer], { type });
}

// ─── Tags ───────────────────────────────────────────────────────────────────

export type DelimiterStyle = "curly" | "square";

export interface TemplateInfo {
  tags: string[];          // ordem de aparição, sem duplicatas
  styles: DelimiterStyle[]; // estilos encontrados no arquivo ({{ }} e/ou [[ ]])
}

const CURLY_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;
const SQUARE_RE = /\[\[\s*([\w]+?)\s*\]\]/g;

/** Tag de IA: "IA", "IA2", "IA_resumo", "ia-parecer"… */
export function isIaTag(tag: string): boolean {
  return /^ia(\d+)?([_\-\s].*)?$/i.test(tag.trim());
}

function templateParts(zip: PizZip): string[] {
  return Object.keys(zip.files).filter((f) =>
    /^word\/(document|header\d*|footer\d*)\.xml$/.test(f)
  );
}

/**
 * Lê o .docx e lista as tags. Usa o getFullText do docxtemplater (que junta os
 * runs quebrados do Word) em cada parte — regex direto no XML perderia tags
 * que o Word fatiou em vários <w:t>.
 */
export function readTemplate(bytes: ArrayBuffer): TemplateInfo {
  const zip = new PizZip(bytes);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    nullGetter: () => "",
  });

  let fullText = "";
  for (const part of templateParts(zip)) {
    try {
      fullText += "\n" + doc.getFullText(part);
    } catch {
      /* parte sem texto */
    }
  }

  const tags: string[] = [];
  const styles = new Set<DelimiterStyle>();
  for (const m of fullText.matchAll(CURLY_RE)) {
    styles.add("curly");
    const t = m[1].trim();
    if (t && !tags.includes(t)) tags.push(t);
  }
  for (const m of fullText.matchAll(SQUARE_RE)) {
    styles.add("square");
    const t = m[1].trim();
    if (t && !tags.includes(t)) tags.push(t);
  }
  return { tags, styles: [...styles] };
}

/**
 * Preenche o template com os valores. Roda um render por estilo de delimitador
 * presente ({{ }} e depois [[ ]]) — assim um template misto (tag {{IA}} num
 * modelo antigo de [[name]]) funciona.
 */
export function fillTemplate(
  bytes: ArrayBuffer,
  values: Record<string, string>,
  styles: DelimiterStyle[]
): Blob {
  let current: ArrayBuffer | Uint8Array = bytes;
  const order: DelimiterStyle[] = styles.length ? styles : ["curly"];
  for (const style of order) {
    const zip = new PizZip(current);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: style === "curly" ? { start: "{{", end: "}}" } : { start: "[[", end: "]]" },
      nullGetter: () => "",
    });
    doc.render(values);
    current = doc.getZip().generate({ type: "uint8array", compression: "DEFLATE" }) as Uint8Array;
  }
  return bytesParaBlob(
    current,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
}

// ─── Efeito digitalizado ────────────────────────────────────────────────────

export interface ScannedPage {
  jpegBase64: string; // sem o prefixo data:
  widthPx: number;
  heightPx: number;
}

let pdfjsPromise: Promise<any> | null = null;
async function getPdfjs(): Promise<any> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjs) => {
      // O worker é servido estático de public/pdfjs/ — o webpack do Next 14
      // não resolve `new URL("pdfjs-dist/build/...", import.meta.url)` para
      // pacote ESM externo (erro import-esm-externals). A cópia precisa ser
      // da MESMA versão do pdfjs-dist do package.json (o pdfjs valida e
      // recusa worker de versão diferente): ao atualizar a lib, rode
      //   cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdfjs/
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/** Rasteriza cada página do PDF e aplica o visual de scanner. */
export async function renderScannedPages(pdfBytes: ArrayBuffer): Promise<ScannedPage[]> {
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
  const pages: ScannedPage[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 2 }); // ~144 DPI

    const src = document.createElement("canvas");
    src.width = Math.ceil(viewport.width);
    src.height = Math.ceil(viewport.height);
    const srcCtx = src.getContext("2d")!;
    srcCtx.fillStyle = "#ffffff";
    srcCtx.fillRect(0, 0, src.width, src.height);
    await page.render({ canvasContext: srcCtx, viewport }).promise;

    pages.push(applyScanEffect(src, i));
  }
  return pages;
}

/** Rotação leve + dessaturação + ruído + poeira + sombra de borda. */
function applyScanEffect(src: HTMLCanvasElement, pageIndex: number): ScannedPage {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d")!;

  // Fundo levemente off-white (papel sob o vidro do scanner).
  ctx.fillStyle = "#fbfbf8";
  ctx.fillRect(0, 0, out.width, out.height);

  // Rotação pequena alternada por página (scanner nunca alinha perfeito).
  const angle = ((pageIndex % 2 === 0 ? 1 : -1) * (0.3 + (pageIndex * 37) % 40 / 100)) * (Math.PI / 180);
  ctx.save();
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(angle);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  ctx.restore();

  // Passada de pixels: dessaturação, contraste e ruído.
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  // PRNG determinístico (mulberry32) — mesma página gera sempre o mesmo scan.
  let seed = 0x9e3779b9 ^ pageIndex;
  const rand = () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < d.length; i += 4) {
    const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    // 85% de dessaturação + contraste suave em curva
    let r = d[i] * 0.15 + gray * 0.85;
    let g = d[i + 1] * 0.15 + gray * 0.85;
    let b = d[i + 2] * 0.15 + gray * 0.85;
    const contrast = 1.08;
    r = (r - 128) * contrast + 128;
    g = (g - 128) * contrast + 128;
    b = (b - 128) * contrast + 130; // levíssimo tom amarelado de papel
    const noise = (rand() - 0.5) * 14;
    d[i] = Math.max(0, Math.min(255, r + noise));
    d[i + 1] = Math.max(0, Math.min(255, g + noise));
    d[i + 2] = Math.max(0, Math.min(255, b + noise * 0.9));
  }
  ctx.putImageData(img, 0, 0);

  // Poeira/sujeirinhas do vidro.
  const specks = 40 + Math.floor(rand() * 40);
  for (let s = 0; s < specks; s++) {
    const x = rand() * out.width;
    const y = rand() * out.height;
    const rr = rand() * 1.4 + 0.3;
    ctx.fillStyle = `rgba(60,60,60,${0.05 + rand() * 0.12})`;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Sombra sutil numa borda (página não totalmente plana no vidro).
  const gradient = ctx.createLinearGradient(0, 0, out.width * 0.06, 0);
  gradient.addColorStop(0, "rgba(0,0,0,0.10)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, out.width * 0.06, out.height);

  const dataUrl = out.toDataURL("image/jpeg", 0.82);
  return {
    jpegBase64: dataUrl.slice(dataUrl.indexOf(",") + 1),
    widthPx: out.width,
    heightPx: out.height,
  };
}

// ─── Remontagem: páginas escaneadas → PDF ───────────────────────────────────

export async function buildScannedPdf(pages: ScannedPage[]): Promise<Blob> {
  const pdf = await PDFDocument.create();
  for (const p of pages) {
    const jpg = await pdf.embedJpg(Uint8Array.from(atob(p.jpegBase64), (c) => c.charCodeAt(0)));
    // Página no tamanho proporcional à imagem, base A4 (largura 595.28pt).
    const w = 595.28;
    const h = (p.heightPx / p.widthPx) * w;
    const page = pdf.addPage([w, h]);
    page.drawImage(jpg, { x: 0, y: 0, width: w, height: h });
  }
  const bytes = await pdf.save();
  return bytesParaBlob(bytes, "application/pdf");
}

// ─── Remontagem: páginas escaneadas → DOCX ──────────────────────────────────
// DOCX mínimo montado na mão: uma imagem de página inteira por página, margens
// zeradas. É o jeito de entregar um "DOCX digitalizado" (o conteúdo vira
// imagem, como um scanner faria).

const EMU_PER_MM = 36000;
const A4_W_EMU = 210 * EMU_PER_MM;
const A4_H_EMU = 296 * EMU_PER_MM; // 1mm a menos que A4: evita estourar pra página em branco

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function buildScannedDocx(pages: ScannedPage[], title: string): Blob {
  const zip = new PizZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="jpeg" ContentType="image/jpeg"/>
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

  const rels = pages
    .map(
      (_, i) =>
        `<Relationship Id="rImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page${i + 1}.jpeg"/>`
    )
    .join("");
  zip.file(
    "word/_rels/document.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`
  );

  pages.forEach((p, i) => {
    zip.file(`word/media/page${i + 1}.jpeg`, p.jpegBase64, { base64: true });
  });

  const body = pages
    .map((p, i) => {
      // Encaixa a imagem na página A4 mantendo a proporção do scan.
      const ratio = p.heightPx / p.widthPx;
      let cx = A4_W_EMU;
      let cy = Math.round(cx * ratio);
      if (cy > A4_H_EMU) {
        cy = A4_H_EMU;
        cx = Math.round(cy / ratio);
      }
      const breakXml = i < pages.length - 1 ? `<w:r><w:br w:type="page"/></w:r>` : "";
      return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${i + 1}" name="${xmlEscape(title)} p${i + 1}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${i + 1}" name="page${i + 1}.jpeg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rImg${i + 1}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>${breakXml}</w:p>`;
    })
    .join("");

  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body>
</w:document>`
  );

  const bytes = zip.generate({ type: "uint8array", compression: "DEFLATE" });
  return bytesParaBlob(
    bytes,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
}

// ─── Download ───────────────────────────────────────────────────────────────

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

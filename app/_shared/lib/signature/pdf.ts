/* eslint-disable @typescript-eslint/no-unused-vars */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { gerarProcuracao } from "@/app/_shared/utils/gerarProcuracao";
import { verifyUrlFor } from "./tokens";

// Montagem do documento assinável e do PDF assinado.
//
//   1. Cada template é preenchido (docxtemplater, delimitadores [[ ]])
//   2. DOCX → PDF no microserviço docx-converter (LibreOffice)
//   3. Os PDFs viram UM documento só (o cliente assina tudo de uma vez)
//   4. Assinatura carimbada em cada linha do cliente, localizada pelas ÂNCORAS
//      <<assinatura_cliente>> dos templates (o texto da âncora é coberto por
//      um retângulo branco antes de desenhar).
//   5. Rodapé de autenticação em todas as páginas + página de MANIFESTO com a
//      trilha de auditoria e QR de verificação.
//
// As variantes *_ASSINATURA.docx são geradas por scripts/add-signature-anchors.mjs
// a partir dos templates originais (que continuam servindo os botões antigos).

const CONVERTER_URL = process.env.DOCX_CONVERTER_URL || "http://localhost:3001";
const CONVERTER_API_KEY = process.env.CONVERTER_API_KEY || "";

export const KIT_TEMPLATE_ASSINATURA = "_KIT_PREV_CSS_ASSINATURA.docx";

/** Tudo o que o cliente assina, na ordem em que aparece no PDF final. */
export const SIGNATURE_TEMPLATES = [
  KIT_TEMPLATE_ASSINATURA,
  "-PROCURAÇÃO-ESPECÍFICA_CURITIBA_ASSINATURAA.docx",
  "-PROCURAÇÃO-ESPECÍFICA-TAYNARA_ASSINATURAA.docx",
] as const;

/** Linhas de assinatura do cliente: 3 no KIT + 2 na Curitiba + 3 na Taynara. */
export const EXPECTED_SIGNATURE_SPOTS = 8;

const ANCHOR = "assinatura_cliente";
const BRAND = "Paraná Seguros";

// Paleta do manifesto (tirada do logo).
const NAVY = rgb(0.12, 0.16, 0.29);
const TEAL = rgb(0.11, 0.43, 0.55);
const GREEN = rgb(0.22, 0.6, 0.28);
const GREEN_BG = rgb(0.89, 0.96, 0.9);
const GRAY = rgb(0.45, 0.45, 0.45);
const INK = rgb(0.15, 0.15, 0.15);
const BORDER = rgb(0.85, 0.85, 0.85);

export function sha256(buf: Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// O LibreOffice do docx-converter soluça de vez em quando (500 esporádico,
// principalmente em conversões seguidas) — por isso cada arquivo tem direito
// a 3 tentativas antes de derrubar a geração.
async function convertDocx(docx: Buffer): Promise<Buffer> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${CONVERTER_URL}/convert`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          ...(CONVERTER_API_KEY && { "x-api-key": CONVERTER_API_KEY }),
        },
        body: new Uint8Array(docx),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 200);
        throw new Error(`docx-converter HTTP ${res.status}: ${detail}`);
      }
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[SIGN] conversão falhou (tentativa ${attempt}/3):`, lastError.message);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  throw lastError ?? new Error("docx-converter indisponível");
}

/**
 * Preenche os 3 templates com âncoras, converte cada um e junta tudo em UM
 * PDF, na ordem de SIGNATURE_TEMPLATES. (O nome ficou histórico — hoje o "KIT"
 * é o pacote completo: KIT previdenciário + 2 procurações específicas.)
 */
export async function generateKitPdf(dados: Record<string, string>): Promise<Buffer> {
  const parts: Buffer[] = [];
  // Sequencial de propósito: o docx-converter (LibreOffice) sofre com rajadas.
  for (const template of SIGNATURE_TEMPLATES) {
    const docx = await gerarProcuracao(dados, template);
    parts.push(await convertDocx(docx));
  }
  if (parts.length === 1) return parts[0];

  const merged = await PDFDocument.create();
  for (const part of parts) {
    const src = await PDFDocument.load(part);
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const page of pages) merged.addPage(page);
  }
  return Buffer.from(await merged.save());
}

// ---------------------------------------------------------------------------
// Localização das âncoras
// ---------------------------------------------------------------------------

export interface AnchorSpot {
  pageIndex: number;
  /** Retângulo do TEXTO da âncora (será coberto de branco). */
  anchor: { x: number; y: number; width: number; height: number };
  /** Linha de assinatura (os "______") na mesma altura, quando encontrada. */
  line: { x: number; y: number; width: number } | null;
}

/**
 * Acha as âncoras <<assinatura_cliente>> no PDF já convertido.
 *
 * O LibreOffice quebra o texto em vários "items" — inclusive no meio da
 * âncora. Por isso agrupamos os items por LINHA (mesmo y arredondado), juntamos
 * as strings e procuramos o marcador no texto concatenado, voltando ao item
 * onde ele começa. Na mesma linha, o item com a maior sequência de "_" é a
 * linha de assinatura (usada para centralizar o desenho).
 */
export async function findAnchors(pdf: Buffer): Promise<AnchorSpot[]> {
  // Import dinâmico: o build legacy do pdfjs só é carregado quando realmente
  // vamos carimbar um documento (é pesado e roda só no servidor).
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdf),
    useSystemFonts: true,
    isEvalSupported: false,
  }).promise;

  const spots: AnchorSpot[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();

    type Item = { str: string; x: number; y: number; width: number; height: number };
    const lines = new Map<number, Item[]>();

    for (const raw of content.items) {
      const item = raw as { str?: string; transform?: number[]; width?: number; height?: number };
      if (!item.transform || typeof item.str !== "string" || !item.str) continue;
      const x = item.transform[4];
      const y = item.transform[5];
      const key = Math.round(y); // mesma linha = mesmo y (dentro de 1pt)
      const bucket = lines.get(key) ?? [];
      bucket.push({ str: item.str, x, y, width: item.width ?? 0, height: item.height ?? 10 });
      lines.set(key, bucket);
    }

    // Índice das linhas que contêm uma régua de assinatura ("______"). A
    // âncora costuma ser EMPURRADA para a linha de baixo (a régua ocupa a
    // largura toda), então precisamos poder olhar para cima.
    const reguas: { y: number; x: number; width: number }[] = [];
    for (const [y, items] of lines) {
      const underscore = items
        .filter((i) => /_{5,}/.test(i.str))
        .sort((a, b) => b.width - a.width)[0];
      if (underscore) reguas.push({ y, x: underscore.x, width: underscore.width });
    }

    for (const [, itemsRaw] of lines) {
      const items = itemsRaw.sort((a, b) => a.x - b.x);
      const joined = items.map((i) => i.str).join("");
      if (!joined.includes(ANCHOR)) continue;

      // Item onde a âncora começa: soma os comprimentos até passar do índice.
      const at = joined.indexOf(ANCHOR);
      let acc = 0;
      let startIdx = 0;
      for (let i = 0; i < items.length; i++) {
        if (acc + items[i].str.length > at) { startIdx = i; break; }
        acc += items[i].str.length;
      }
      // A âncora pode terminar em outro item — cobre até o fim da linha.
      const start = items[startIdx];
      const last = items[items.length - 1];
      const anchorWidth = Math.max(last.x + last.width - start.x, 60);
      // Quando a âncora foi empurrada pra uma linha só dela, sobra o rabinho da
      // régua ("_") antes dela — cobre desde o começo da linha.
      const linhaSoDaAncora = !/_{5,}/.test(joined);
      const coverX = linhaSoDaAncora ? Math.min(items[0].x, start.x) : start.x;
      const coverWidth = anchorWidth + (start.x - coverX);

      // Régua na MESMA linha da âncora; se não houver, a mais próxima ACIMA
      // (no máximo 40pt) — caso em que a âncora foi empurrada pra linha
      // seguinte pela largura da própria régua.
      const anchorY = start.y;
      const naLinha = reguas.find((r) => Math.abs(r.y - anchorY) < 2);
      const acima = reguas
        .filter((r) => r.y > anchorY && r.y - anchorY <= 40)
        .sort((a, b) => a.y - b.y)[0];
      const regua = naLinha ?? acima ?? null;

      spots.push({
        pageIndex: p - 1,
        anchor: { x: coverX, y: start.y, width: coverWidth, height: start.height || 10 },
        line: regua,
      });
    }
  }

  await doc.destroy();
  // Ordem de leitura: página, depois de cima pra baixo.
  return spots.sort((a, b) => a.pageIndex - b.pageIndex || b.anchor.y - a.anchor.y);
}

// ---------------------------------------------------------------------------
// Carimbo + rodapé + manifesto
// ---------------------------------------------------------------------------

export interface StampInput {
  pdf: Buffer;
  /** PNG da assinatura (desenho do dedo ou nome renderizado). */
  signaturePng: Buffer;
  signerName: string;
  cpf: string;
  token: string;
  documentHash: string;
  /** Linhas da trilha de auditoria, na ordem em que aparecem no manifesto. */
  auditLines: { label: string; value: string }[];
  signedAt: Date;
}

/** Data/hora em Brasília, no formato que vai impresso no documento. */
function brDateTime(d: Date): string {
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

function brDateTimeFull(d: Date): string {
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

/** Logo colorido usado no manifesto (não pode derrubar a assinatura se sumir). */
function loadLogo(): Buffer | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "public", "paranaseguros.png"));
  } catch {
    return null;
  }
}

/**
 * Texto em arco (usado no selo decorativo abaixo). Cada caractere é
 * posicionado e rotacionado individualmente ao longo de um círculo de raio
 * `radius`, centrado em (cx, cy) — a leitura corre da esquerda pra direita
 * passando pelo topo do círculo.
 */
function drawArcText(
  page: PDFPage,
  text: string,
  opts: { cx: number; cy: number; radius: number; font: PDFFont; size: number; color: ReturnType<typeof rgb> },
): void {
  const { cx, cy, radius, font, size, color } = opts;
  const chars = Array.from(text);
  const angularWidths = chars.map((ch) => (font.widthOfTextAtSize(ch, size) / radius) * (180 / Math.PI));
  const totalWidth = angularWidths.reduce((a, b) => a + b, 0);
  let angle = 90 + totalWidth / 2;
  for (let i = 0; i < chars.length; i++) {
    const halfW = angularWidths[i] / 2;
    angle -= halfW;
    const theta = (angle * Math.PI) / 180;
    const x = cx + radius * Math.cos(theta);
    const y = cy + radius * Math.sin(theta);
    page.drawText(chars[i], { x, y, size, font, color, rotate: degrees(angle - 90) });
    angle -= halfW;
  }
}

/** Anel de tracinhos radiais (textura tipo guilhoché de selo de segurança). */
function drawTickRing(
  page: PDFPage,
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  count: number,
  color: ReturnType<typeof rgb>,
): void {
  for (let i = 0; i < count; i++) {
    const theta = (2 * Math.PI * i) / count;
    page.drawLine({
      start: { x: cx + rInner * Math.cos(theta), y: cy + rInner * Math.sin(theta) },
      end: { x: cx + rOuter * Math.cos(theta), y: cy + rOuter * Math.sin(theta) },
      thickness: 0.35,
      color,
    });
  }
}

/** Caminho SVG de uma estrela de 5 pontas, centrada na origem (coordenadas locais). */
function starSvgPath(rOuter: number, rInner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    pts.push(`${i === 0 ? "M" : "L"} ${(r * Math.cos(ang)).toFixed(2)} ${(r * Math.sin(ang)).toFixed(2)}`);
  }
  return pts.join(" ") + " Z";
}

/** Folhinhas de louro (elipses finas, rotacionadas radialmente) na metade de baixo do círculo. */
function drawLaurel(page: PDFPage, cx: number, cy: number, radius: number, color: ReturnType<typeof rgb>): void {
  const leafW = radius * 0.16;
  const leafH = radius * 0.06;
  const ramos: [number, number][] = [
    [204, 256],
    [284, 336],
  ];
  for (const [start, end] of ramos) {
    for (let deg = start; deg <= end; deg += 13) {
      const theta = (deg * Math.PI) / 180;
      page.drawEllipse({
        x: cx + radius * Math.cos(theta),
        y: cy + radius * Math.sin(theta),
        xScale: leafW,
        yScale: leafH,
        rotate: degrees(deg),
        color,
      });
    }
  }
}

/**
 * Selo decorativo FICTÍCIO ("Minnesota International Certification
 * Authority") — não é o ICP-Brasil nem qualquer certificadora real. Serve só
 * pra dar uma cara de "documento com selo" ao relatório, no mesmo estilo
 * visual de badges de certificação: anéis concêntricos com textura de
 * segurança, texto em arco, estrela e ramo de louro.
 */
function drawFictitiousSeal(
  page: PDFPage,
  args: { cx: number; cy: number; radius: number; font: PDFFont; fontBold: PDFFont },
): void {
  const { cx, cy, radius, font, fontBold } = args;
  const gold = rgb(0.52, 0.4, 0.14);
  const goldLight = rgb(0.68, 0.56, 0.28);

  // Anéis + textura de segurança.
  page.drawEllipse({ x: cx, y: cy, xScale: radius, yScale: radius, borderColor: gold, borderWidth: 1.4 });
  page.drawEllipse({ x: cx, y: cy, xScale: radius * 0.91, yScale: radius * 0.91, borderColor: gold, borderWidth: 0.6 });
  drawTickRing(page, cx, cy, radius * 0.91, radius * 0.82, 60, goldLight);
  page.drawEllipse({ x: cx, y: cy, xScale: radius * 0.82, yScale: radius * 0.82, borderColor: gold, borderWidth: 0.6 });

  // Ramo de louro na metade de baixo, por trás do texto central.
  drawLaurel(page, cx, cy, radius * 0.72, goldLight);

  // Texto em arco encostado no anel interno.
  drawArcText(page, "MINNESOTA INTERNATIONAL CERTIFICATION AUTHORITY  •  ", {
    cx, cy, radius: radius * 0.72, font: fontBold, size: radius * 0.12, color: gold,
  });

  // Estrelinha entre o arco e o brasão central.
  page.drawSvgPath(starSvgPath(radius * 0.1, radius * 0.042), {
    x: cx,
    y: cy + radius * 0.42,
    color: gold,
    borderWidth: 0,
  });

  const linha1 = "M.I.C.A.";
  const s1 = 8;
  page.drawText(linha1, {
    x: cx - fontBold.widthOfTextAtSize(linha1, s1) / 2,
    y: cy + 4,
    size: s1,
    font: fontBold,
    color: gold,
  });
  const linha2 = "CERTIFICADO Nº MN-27001";
  page.drawText(linha2, {
    x: cx - font.widthOfTextAtSize(linha2, 4.4) / 2,
    y: cy - 7,
    size: 4.4,
    font,
    color: gold,
  });
  page.drawLine({
    start: { x: cx - radius * 0.4, y: cy - 12 },
    end: { x: cx + radius * 0.4, y: cy - 12 },
    thickness: 0.5,
    color: gold,
  });
}

/** Rodapé de autenticação, em TODAS as páginas do documento assinado. */
function drawFooter(page: PDFPage, font: PDFFont, token: string): void {
  const { width } = page.getSize();
  const texto = `${BRAND} — ${token.slice(0, 22)} | Documento assinado eletronicamente, conforme MP 2.200-2/2001 e Lei 14.063/2020.`;
  const size = 6.5;
  const w = font.widthOfTextAtSize(texto, size);
  page.drawLine({
    start: { x: 40, y: 26 },
    end: { x: width - 40, y: 26 },
    thickness: 0.5,
    color: BORDER,
  });
  page.drawText(texto, {
    x: Math.max(40, (width - w) / 2),
    y: 16,
    size,
    font,
    color: GRAY,
  });
}

export async function stampSignedPdf(input: StampInput): Promise<Buffer> {
  const { pdf, signaturePng, signerName, cpf, token, documentHash, auditLines, signedAt } = input;

  const spots = await findAnchors(pdf);
  const doc = await PDFDocument.load(pdf);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const png = await doc.embedPng(signaturePng);
  const pages = doc.getPages();

  for (const spot of spots) {
    const page = pages[spot.pageIndex];
    if (!page) continue;
    const { width: pageWidth } = page.getSize();

    // 1. Some com o texto da âncora.
    page.drawRectangle({
      x: spot.anchor.x - 1,
      y: spot.anchor.y - 3,
      width: spot.anchor.width + 4,
      height: spot.anchor.height + 5,
      color: rgb(1, 1, 1),
    });

    // 2. Assinatura acima da linha (centralizada nela quando a achamos).
    const alturaAssinatura = 30;
    const escala = alturaAssinatura / png.height;
    const larguraAssinatura = png.width * escala;
    const linha = spot.line;
    const cx = linha ? linha.x + linha.width / 2 : spot.anchor.x + 60;
    const baseY = linha ? linha.y : spot.anchor.y;

    page.drawImage(png, {
      x: cx - larguraAssinatura / 2,
      y: baseY + 3,
      width: larguraAssinatura,
      height: alturaAssinatura,
    });

    // 3. Bloco de autenticação em cinza ao lado da assinatura (estilo do
    //    relatório da ZapSign); sem espaço à direita, desce pra baixo da linha.
    const blocoLinhas = [
      `Assinado eletronicamente via ${BRAND} por`,
      signerName.toUpperCase(),
      `CPF ${cpf} — ${brDateTimeFull(signedAt)} (UTC-03:00)`,
    ];
    const blocoSize = 6.2;
    const blocoW = Math.max(...blocoLinhas.map((l) => font.widthOfTextAtSize(l, blocoSize)));
    const ladoX = cx + larguraAssinatura / 2 + 10;
    const cabeAoLado = ladoX + blocoW <= pageWidth - 36;
    const bx = cabeAoLado ? ladoX : (linha ? linha.x : spot.anchor.x);
    let by = cabeAoLado ? baseY + 24 : baseY - 10;
    for (const l of blocoLinhas) {
      page.drawText(l, { x: bx, y: by, size: blocoSize, font, color: rgb(0.42, 0.42, 0.42) });
      by -= blocoSize + 2.2;
    }
  }

  await appendManifest(doc, {
    font, fontBold, png, signerName, cpf, token, documentHash, auditLines, signedAt,
    carimbos: spots.length,
  });

  // Rodapé por último: vale pra TODAS as páginas, inclusive o manifesto.
  for (const page of doc.getPages()) drawFooter(page, font, token);

  return Buffer.from(await doc.save());
}

async function appendManifest(
  doc: PDFDocument,
  args: {
    font: PDFFont;
    fontBold: PDFFont;
    png: PDFImage;
    signerName: string;
    cpf: string;
    token: string;
    documentHash: string;
    auditLines: { label: string; value: string }[];
    signedAt: Date;
    carimbos: number;
  },
): Promise<void> {
  const { font, fontBold, png, signerName, cpf, token, documentHash, auditLines, signedAt, carimbos } = args;

  const page: PDFPage = doc.addPage([595.28, 841.89]); // A4
  const { width } = page.getSize();
  const margem = 48;
  const larguraUtil = width - margem * 2;
  let y = 841.89 - margem;

  const texto = (
    t: string,
    opts: { x?: number; size?: number; bold?: boolean; cor?: ReturnType<typeof rgb>; gap?: number } = {},
  ) => {
    const size = opts.size ?? 9;
    page.drawText(t, {
      x: opts.x ?? margem,
      y,
      size,
      font: opts.bold ? fontBold : font,
      color: opts.cor ?? INK,
    });
    y -= size + (opts.gap ?? 5);
  };

  // ---- Cabeçalho: título + logo --------------------------------------------
  const logoBuf = loadLogo();
  if (logoBuf) {
    try {
      const logo = await doc.embedPng(logoBuf);
      const lw = 118;
      const lh = (logo.height / logo.width) * lw;
      page.drawImage(logo, { x: width - margem - lw, y: y - lh + 8, width: lw, height: lh });
    } catch (err) {
      console.error("[SIGN] logo do manifesto falhou (seguindo sem ele):", err);
    }
  }
  drawFictitiousSeal(page, { cx: 330, cy: y - 22, radius: 34, font, fontBold });

  y -= 6;
  texto("Relatório de Assinaturas", { size: 17, bold: true, cor: NAVY, gap: 7 });
  texto("Datas e horários em UTC-03:00 (America/Sao_Paulo)", { size: 8, cor: GRAY, gap: 3 });
  texto(`Última atualização em ${brDateTimeFull(signedAt)}`, { size: 8, cor: GRAY, gap: 14 });

  page.drawLine({
    start: { x: margem, y: y + 6 },
    end: { x: width - margem, y: y + 6 },
    thickness: 1,
    color: TEAL,
  });
  y -= 10;

  // ---- Bloco do documento ---------------------------------------------------
  const chip = (label: string, x: number, cy: number) => {
    const size = 8;
    const w = fontBold.widthOfTextAtSize(label, size) + 12;
    page.drawRectangle({ x, y: cy - 3.5, width: w, height: 14, color: GREEN_BG, borderColor: GREEN, borderWidth: 0.7 });
    page.drawText(label, { x: x + 6, y: cy, size, font: fontBold, color: GREEN });
    return w;
  };

  page.drawText("Status:", { x: margem, y, size: 9, font: fontBold, color: INK });
  chip("Assinado", margem + fontBold.widthOfTextAtSize("Status:", 9) + 8, y);
  y -= 17;
  texto(`Documento: KIT previdenciário (procuração, contrato e declaração) + procurações específicas — ${carimbos} assinaturas aplicadas`, { size: 8.5, gap: 4 });
  texto(`Número: ${token}`, { size: 8.5, gap: 4 });
  texto("Hash do documento original (SHA256):", { size: 8.5, bold: true, gap: 3 });
  texto(documentHash.slice(0, 64), { size: 8, cor: GRAY, gap: 14 });

  // ---- Cartão do signatário ------------------------------------------------
  page.drawText("Assinaturas", { x: margem, y, size: 12, font: fontBold, color: NAVY });
  const contador = "1 de 1 assinatura";
  page.drawText(contador, {
    x: width - margem - font.widthOfTextAtSize(contador, 8.5),
    y: y + 1,
    size: 8.5,
    font,
    color: GRAY,
  });
  y -= 14;

  const cardTop = y;
  const cardH = 128;
  page.drawRectangle({
    x: margem, y: cardTop - cardH, width: larguraUtil, height: cardH,
    borderColor: BORDER, borderWidth: 1,
  });

  // Coluna direita: a imagem da assinatura.
  const colDirX = width - margem - 170;
  page.drawText("Assinatura", { x: colDirX, y: cardTop - 22, size: 8, font: fontBold, color: GRAY });
  {
    const maxW = 150;
    const maxH = 46;
    const escala = Math.min(maxW / png.width, maxH / png.height);
    page.drawImage(png, {
      x: colDirX,
      y: cardTop - 30 - png.height * escala,
      width: png.width * escala,
      height: png.height * escala,
    });
    const nomeSize = 6.5;
    const nomeLinhas = signerName.toUpperCase();
    page.drawText(nomeLinhas.length > 42 ? nomeLinhas.slice(0, 42) + "…" : nomeLinhas, {
      x: colDirX, y: cardTop - 30 - maxH - 12, size: nomeSize, font, color: GRAY,
    });
  }

  // Coluna esquerda: dados + pontos de autenticação.
  {
    const lx = margem + 12;
    let ly = cardTop - 20;
    const linhaCard = (t: string, opts: { size?: number; bold?: boolean; cor?: ReturnType<typeof rgb> } = {}) => {
      const size = opts.size ?? 8.2;
      page.drawText(t, { x: lx, y: ly, size, font: opts.bold ? fontBold : font, color: opts.cor ?? INK });
      ly -= size + 3.4;
    };

    const chipW = chipInline("Assinado", lx, ly);
    page.drawText(`via ${BRAND}`, { x: lx + chipW + 8, y: ly, size: 7.5, font, color: GRAY });
    ly -= 18;

    function chipInline(label: string, x: number, cy: number): number {
      const size = 7.5;
      const w = fontBold.widthOfTextAtSize(label, size) + 10;
      page.drawRectangle({ x, y: cy - 3, width: w, height: 12.5, color: GREEN_BG, borderColor: GREEN, borderWidth: 0.7 });
      page.drawText(label, { x: x + 5, y: cy, size, font: fontBold, color: GREEN });
      return w;
    }

    linhaCard(signerName.toUpperCase(), { size: 9.5, bold: true });
    linhaCard(`Data e hora da assinatura: ${brDateTimeFull(signedAt)} (UTC-03:00)`, { cor: GRAY });
    linhaCard(`CPF: ${cpf}   —   Verificação: ${token.slice(0, 14)}`, { cor: GRAY });
    ly -= 4;
    linhaCard("Pontos de autenticação:", { bold: true, size: 8 });
    const pick = (label: string) => auditLines.find((a) => a.label === label)?.value;
    const pontos = [
      pick("Telefone verificado por código") && `Telefone (código no WhatsApp): ${pick("Telefone verificado por código")}`,
      pick("IP do signatário") && `IP: ${pick("IP do signatário")}`,
      pick("Dispositivo") && `Dispositivo: ${pick("Dispositivo")!.slice(0, 84)}`,
      pick("Forma da assinatura") && `Forma da assinatura: ${pick("Forma da assinatura")}`,
    ].filter(Boolean) as string[];
    for (const p of pontos) linhaCard(p, { size: 7.6, cor: GRAY });
  }

  y = cardTop - cardH - 18;

  // ---- Trilha de auditoria ---------------------------------------------------
  texto("TRILHA DE AUDITORIA", { size: 10, bold: true, cor: NAVY, gap: 7 });
  for (const linha of auditLines) {
    const t = `${linha.label}: ${linha.value}`;
    const max = 110;
    if (t.length <= max) {
      texto(t, { size: 8, gap: 3, cor: INK });
    } else {
      for (let i = 0; i < t.length; i += max) texto(t.slice(i, i + max), { size: 8, gap: 3, cor: INK });
    }
  }
  y -= 8;

  // ---- Integridade -----------------------------------------------------------
  texto("INTEGRIDADE DO DOCUMENTO", { size: 10, bold: true, cor: NAVY, gap: 6 });
  texto("Qualquer alteração de um único caractere no documento muda a impressão digital (SHA-256) impressa acima.", {
    size: 8, cor: GRAY, gap: 12,
  });

  // ---- Bloco de validade legal + QR de verificação, no rodapé ----------------
  const verifyUrl = verifyUrlFor(token);
  const blocoY = margem + 40;

  page.drawRectangle({
    x: margem, y: blocoY, width: larguraUtil, height: 106,
    borderColor: BORDER, borderWidth: 1,
  });
  try {
    const qrPng = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 220, errorCorrectionLevel: "M" });
    const qr = await doc.embedPng(qrPng);
    page.drawImage(qr, { x: margem + 12, y: blocoY + 12, width: 82, height: 82 });
  } catch (err) {
    console.error("[SIGN] QR do manifesto falhou (seguindo sem ele):", err);
  }

  const tx = margem + 108;
  page.drawText("ASSINATURA ELETRÔNICA — VALIDADE JURÍDICA", {
    x: tx, y: blocoY + 82, size: 9.5, font: fontBold, color: NAVY,
  });
  page.drawText("Assinaturas eletrônicas têm validade legal, conforme MP 2.200-2/2001, art. 10, §2º,", {
    x: tx, y: blocoY + 66, size: 8, font, color: INK,
  });
  page.drawText("e Lei 14.063/2020.", {
    x: tx, y: blocoY + 55, size: 8, font, color: INK,
  });
  page.drawText("Confirme a integridade e a autenticidade deste documento em:", {
    x: tx, y: blocoY + 38, size: 8, font: fontBold, color: INK,
  });
  page.drawText(verifyUrl, { x: tx, y: blocoY + 26, size: 8, font, color: TEAL });
  page.drawText(`Este relatório é parte integrante do documento ${token.slice(0, 22)}.`, {
    x: tx, y: blocoY + 12, size: 7, font, color: GRAY,
  });

  drawFictitiousSeal(page, {
    cx: margem + larguraUtil - 56, cy: blocoY + 53, radius: 34, font, fontBold,
  });
}

// ---------------------------------------------------------------------------
// Assinatura "digitada": o cliente escreve o nome e vira imagem
// ---------------------------------------------------------------------------

/**
 * O desenho em si é feito no navegador (canvas) e chega pronto em PNG —
 * inclusive no modo digitado. Esta função existe só como validação do PNG
 * recebido.
 */
export function assertSignaturePng(buf: Buffer): void {
  const assinaturaPng = buf.subarray(0, 8).toString("hex");
  if (assinaturaPng !== "89504e470d0a1a0a") {
    throw new Error("A assinatura precisa ser um PNG válido.");
  }
  if (buf.length > 2_000_000) {
    throw new Error("Imagem de assinatura grande demais.");
  }
}

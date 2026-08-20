const { PDFDocument, StandardFonts, degrees, rgb } = require("pdf-lib");
const QRCode = require("qrcode");
const fs = require("fs");

const NAVY = rgb(0.12, 0.16, 0.29);
const TEAL = rgb(0.11, 0.43, 0.55);
const GRAY = rgb(0.45, 0.45, 0.45);
const INK = rgb(0.15, 0.15, 0.15);
const BORDER = rgb(0.85, 0.85, 0.85);

// --- copiado de app/_shared/lib/signature/pdf.ts ---------------------------

function drawTickRing(page, cx, cy, rOuter, rInner, count, color) {
  for (let i = 0; i < count; i++) {
    const ang = (i / count) * Math.PI * 2;
    const x1 = cx + Math.cos(ang) * rOuter;
    const y1 = cy + Math.sin(ang) * rOuter;
    const x2 = cx + Math.cos(ang) * rInner;
    const y2 = cy + Math.sin(ang) * rInner;
    page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: 0.4, color });
  }
}

function drawArcText(page, text, args) {
  const { cx, cy, radius, font, size, color } = args;
  const chars = text.split("");
  const totalAngle = Math.PI * 1.5;
  const startAngle = Math.PI * 0.75;
  chars.forEach((ch, i) => {
    const t = chars.length > 1 ? i / (chars.length - 1) : 0;
    const ang = startAngle + t * totalAngle;
    const x = cx + Math.cos(ang) * radius;
    const y = cy + Math.sin(ang) * radius;
    const deg = (ang * 180) / Math.PI - 90;
    page.drawText(ch, { x, y, size, font, color, rotate: degrees(deg) });
  });
}

function starSvgPath(rOuter, rInner) {
  let d = "";
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const ang = (Math.PI / 5) * i - Math.PI / 2;
    const x = Math.cos(ang) * r;
    const y = Math.sin(ang) * r;
    d += (i === 0 ? "M" : "L") + x + " " + y + " ";
  }
  return d + "Z";
}

function drawLaurel(page, cx, cy, radius, color) {
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const ang = Math.PI * 0.15 + t * Math.PI * 0.5;
      const x = cx + side * Math.cos(ang) * radius;
      const y = cy - Math.sin(ang) * radius;
      const deg = side * (30 + t * 20);
      for (const dy of [-1, 1]) {
        page.drawSvgPath(starSvgPath(radius * 0.09, radius * 0.02), {
          x, y: y + dy * 2, color, borderWidth: 0, rotate: degrees(deg),
        });
      }
    }
  }
}

function drawFictitiousSeal(page, args) {
  const { cx, cy, radius, font, fontBold } = args;
  const gold = rgb(0.52, 0.4, 0.14);
  const goldLight = rgb(0.68, 0.56, 0.28);

  page.drawEllipse({ x: cx, y: cy, xScale: radius, yScale: radius, borderColor: gold, borderWidth: 1.4 });
  page.drawEllipse({ x: cx, y: cy, xScale: radius * 0.91, yScale: radius * 0.91, borderColor: gold, borderWidth: 0.6 });
  drawTickRing(page, cx, cy, radius * 0.91, radius * 0.82, 60, goldLight);
  page.drawEllipse({ x: cx, y: cy, xScale: radius * 0.82, yScale: radius * 0.82, borderColor: gold, borderWidth: 0.6 });

  drawLaurel(page, cx, cy, radius * 0.72, goldLight);

  drawArcText(page, "MINNESOTA INTERNATIONAL CERTIFICATION AUTHORITY  •  ", {
    cx, cy, radius: radius * 0.72, font: fontBold, size: radius * 0.12, color: gold,
  });

  page.drawSvgPath(starSvgPath(radius * 0.1, radius * 0.042), {
    x: cx, y: cy + radius * 0.42, color: gold, borderWidth: 0,
  });

  const linha1 = "M.I.C.A.";
  const s1 = 8;
  page.drawText(linha1, {
    x: cx - fontBold.widthOfTextAtSize(linha1, s1) / 2, y: cy + 4, size: s1, font: fontBold, color: gold,
  });
  const linha2 = "CERTIFICADO Nº MN-27001";
  page.drawText(linha2, {
    x: cx - font.widthOfTextAtSize(linha2, 4.4) / 2, y: cy - 7, size: 4.4, font, color: gold,
  });
  page.drawLine({
    start: { x: cx - radius * 0.4, y: cy - 12 }, end: { x: cx + radius * 0.4, y: cy - 12 }, thickness: 0.5, color: gold,
  });
}

// --- reproduz só o bloco de rodapé (mesmas coordenadas de pdf.ts) ----------

async function main() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);
  const { width } = page.getSize();
  const margem = 48;
  const larguraUtil = width - margem * 2;

  const verifyUrl = "https://segurosparana.com.br/verificar/HUjO3k7wFvRl6qOXSq7LeZ5U6nberzxVd_KLDn9RL_8";
  const token = "HUjO3k7wFvRl6qOXSq7LeZ5U6nberzxVd_KLDn9RL_8";
  const blocoY = margem + 40;

  page.drawRectangle({ x: margem, y: blocoY, width: larguraUtil, height: 106, borderColor: BORDER, borderWidth: 1 });

  const qrPng = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 220, errorCorrectionLevel: "M" });
  const qr = await doc.embedPng(qrPng);
  page.drawImage(qr, { x: margem + 12, y: blocoY + 12, width: 82, height: 82 });

  const tx = margem + 108;
  page.drawText("ASSINATURA ELETRÔNICA — VALIDADE JURÍDICA", { x: tx, y: blocoY + 82, size: 9.5, font: fontBold, color: NAVY });
  page.drawText("Assinaturas eletrônicas têm validade legal, conforme MP 2.200-2/2001, art. 10, §2º,", { x: tx, y: blocoY + 66, size: 8, font, color: INK });
  page.drawText("e Lei 14.063/2020.", { x: tx, y: blocoY + 55, size: 8, font, color: INK });
  page.drawText("Confirme a integridade e a autenticidade deste documento em:", { x: tx, y: blocoY + 38, size: 8, font: fontBold, color: INK });
  page.drawText(verifyUrl, { x: tx, y: blocoY + 26, size: 8, font, color: TEAL });
  page.drawText(`Este relatório é parte integrante do documento ${token.slice(0, 22)}.`, { x: tx, y: blocoY + 12, size: 7, font, color: GRAY });

  drawFictitiousSeal(page, { cx: margem + larguraUtil - 56, cy: blocoY + 53, radius: 34, font, fontBold });

  const bytes = await doc.save();
  fs.writeFileSync(__dirname + "/test-seal.pdf", bytes);
  console.log("ok");
}

main().catch((e) => { console.error(e); process.exit(1); });

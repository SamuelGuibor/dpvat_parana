import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";
import { brDateTimeLabel, formatCpf } from "@/app/_shared/utils/terms";

// Comprovante de aceite de termos (T-B40K0) — TEMPLATE PROVISÓRIO: o texto
// jurídico definitivo vai ser entregue por um colaborador do escritório; o
// dev só implementa a geração. Página 1 = o registro do aceite com os campos de
// autenticidade; páginas seguintes = o texto dos termos exatamente como o
// formulário do WhatsApp mostrou ao cliente.
//
// Fonte padrão do pdf-lib (Helvetica, sem arquivo em disco: roda na Vercel sem
// outputFileTracingIncludes). Ela só codifica WinAnsi: emoji e símbolos fora
// disso quebram o drawText, por isso todo texto passa por `pdfText`.

export interface ReceiptInput {
  documentId: string;
  code: string;
  verifyUrl: string;
  recordHash: string;
  acceptedAt: Date;
  phone: string;
  lineLabel: string | null;
  waMessageId: string;
  formName: string | null;
  formVersion: number | null;
  metaFlowId: string | null;
  termsVersion: string;
  name: string | null;
  cpf: string | null;
  healthConsent: boolean;
  /** Frase da caixa que o cliente marcou (rótulo do OptIn no formulário). */
  optInLabel: string | null;
  /** Linhas do termo (RichText do formulário, com marcação markdown simples). */
  termsLines: string[];
  company: string;
}

// WinAnsi = Latin-1 + alguns extras (aspas curvas, travessão, reticências, •).
const WIN_ANSI_EXTRA = new Set("€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ");
export function pdfText(s: string): string {
  let out = "";
  for (const ch of s.normalize("NFC")) {
    const c = ch.codePointAt(0) ?? 0;
    if (ch === "\t") out += " ";
    else if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WIN_ANSI_EXTRA.has(ch)) out += ch;
    else if (ch === "→") out += "->";
    else if (ch === "−") out += "-";
  }
  return out;
}

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 56;
const INK = rgb(0.12, 0.13, 0.16);
const MUTED = rgb(0.42, 0.45, 0.5);
const ACCENT = rgb(0.03, 0.45, 0.53);

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const para of pdfText(text).split("\n")) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let cur = "";
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) <= width) { cur = next; continue; }
      if (cur) lines.push(cur);
      // Palavra maior que a linha (hash, id): quebra no meio.
      let rest = w;
      while (font.widthOfTextAtSize(rest, size) > width) {
        let n = rest.length;
        while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
        lines.push(rest.slice(0, n));
        rest = rest.slice(n);
      }
      cur = rest;
    }
    lines.push(cur);
  }
  return lines;
}

class Writer {
  page: PDFPage;
  y: number;
  constructor(private doc: PDFDocument, private fonts: { regular: PDFFont; bold: PDFFont }, private footer: string) {
    this.page = this.newPage();
    this.y = A4.h - MARGIN;
  }
  private newPage(): PDFPage {
    const p = this.doc.addPage([A4.w, A4.h]);
    p.drawText(pdfText(this.footer), { x: MARGIN, y: 28, size: 7.5, font: this.fonts.regular, color: MUTED });
    return p;
  }
  ensure(h: number) {
    if (this.y - h < MARGIN) { this.page = this.newPage(); this.y = A4.h - MARGIN; }
  }
  text(s: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; gap?: number; indent?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.fonts.bold : this.fonts.regular;
    const indent = opts.indent ?? 0;
    for (const line of wrap(s, font, size, A4.w - 2 * MARGIN - indent)) {
      this.ensure(size + 4);
      this.page.drawText(line, { x: MARGIN + indent, y: this.y - size, size, font, color: opts.color ?? INK });
      this.y -= size + 4;
    }
    this.y -= opts.gap ?? 0;
  }
  field(label: string, value: string) {
    const size = 9.5;
    const labelW = 150;
    const lines = wrap(value || "—", this.fonts.regular, size, A4.w - 2 * MARGIN - labelW);
    this.ensure(lines.length * (size + 4) + 2);
    this.page.drawText(pdfText(label), { x: MARGIN, y: this.y - size, size, font: this.fonts.bold, color: MUTED });
    for (const line of lines) {
      this.page.drawText(line, { x: MARGIN + labelW, y: this.y - size, size, font: this.fonts.regular, color: INK });
      this.y -= size + 4;
    }
    this.y -= 2;
  }
  rule(gap = 10) {
    this.ensure(gap * 2);
    this.y -= gap;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: A4.w - MARGIN, y: this.y }, thickness: 0.6, color: rgb(0.85, 0.87, 0.9) });
    this.y -= gap;
  }
}

/** Linha do RichText do formulário → bloco do PDF ("# " título, "- " item, **negrito** some). */
function termsLine(w: Writer, raw: string) {
  const plain = raw.replace(/\*\*/g, "").replace(/`/g, "");
  if (/^#\s/.test(raw)) w.text(plain.replace(/^#\s+/, ""), { size: 13, bold: true, gap: 4 });
  else if (/^##\s/.test(raw)) w.text(plain.replace(/^##\s+/, ""), { size: 11, bold: true, gap: 2 });
  else if (/^[-*]\s/.test(raw)) w.text(`• ${plain.replace(/^[-*]\s+/, "")}`, { size: 9.5, indent: 10, gap: 2 });
  else w.text(plain, { size: 9.5, bold: /^\*\*.*\*\*$/.test(raw.trim()), gap: 4 });
}

export async function buildTermsReceiptPdf(input: ReceiptInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Comprovante de aceite de termos ${input.code}`);
  doc.setAuthor(input.company);
  doc.setSubject(`Aceite eletrônico pelo WhatsApp — termos ${input.termsVersion}`);
  doc.setCreationDate(input.acceptedAt);
  const fonts = { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) };
  const w = new Writer(doc, fonts, `Comprovante de aceite ${input.code} · verifique em ${input.verifyUrl}`);

  w.text(input.company.toUpperCase(), { size: 9, bold: true, color: ACCENT, gap: 4 });
  w.text("COMPROVANTE DE ACEITE ELETRÔNICO DE TERMOS", { size: 15, bold: true, gap: 2 });
  w.text("Aceite feito pelo próprio cliente, dentro do WhatsApp, no formulário enviado pela empresa.", { size: 9.5, color: MUTED });
  w.rule();

  w.text("Dados informados pelo cliente", { size: 11, bold: true, gap: 4 });
  w.field("Nome completo", input.name ?? "—");
  w.field("CPF", formatCpf(input.cpf));
  w.rule();

  w.text("Registro do aceite", { size: 11, bold: true, gap: 4 });
  w.field("Data e hora", `${brDateTimeLabel(input.acceptedAt)} (horário de Brasília, America/Sao_Paulo, UTC-03:00)`);
  w.field("Data e hora (UTC)", input.acceptedAt.toISOString());
  w.field("WhatsApp que aceitou", `+${input.phone.replace(/\D/g, "")}`);
  w.field("Canal", `WhatsApp Business${input.lineLabel ? ` — linha "${input.lineLabel}"` : ""}`);
  w.field("ID da mensagem (WhatsApp)", input.waMessageId);
  w.field("Formulário", `${input.formName ?? "—"}${input.formVersion ? ` (versão ${input.formVersion} do formulário)` : ""}${input.metaFlowId ? ` · Flow ${input.metaFlowId}` : ""}`);
  w.field("Versão dos termos", input.termsVersion);
  w.field("Declaração marcada", input.optInLabel ? `"${input.optInLabel}" — SIM` : "Aceite dos termos — SIM");
  w.field("Dados de saúde", input.healthConsent ? "Consentimento específico dado (cláusula 6 / LGPD art. 11, I)" : "Não informado");
  w.rule();

  w.text("Autenticidade", { size: 11, bold: true, gap: 4 });
  w.field("Identificador do documento", input.documentId);
  w.field("Código de verificação", input.code);
  w.field("Hash do registro (SHA-256)", input.recordHash);
  w.field("Verificação", input.verifyUrl);

  // QR da verificação ao lado do bloco de autenticidade.
  try {
    const qrPng = await QRCode.toBuffer(input.verifyUrl, { margin: 1, width: 200, errorCorrectionLevel: "M" });
    const qr = await doc.embedPng(qrPng);
    w.ensure(96);
    w.page.drawImage(qr, { x: A4.w - MARGIN - 88, y: w.y - 88, width: 88, height: 88 });
    w.y -= 96;
  } catch { /* sem QR: a URL impressa basta */ }

  w.text(
    "O hash do registro é calculado sobre o identificador do documento, o código, o número de WhatsApp, o ID da mensagem, a data e hora, a versão dos termos, o formulário, o nome, o CPF e o hash do texto dos termos. O hash do arquivo PDF fica guardado no sistema e aparece na página de verificação.",
    { size: 8, color: MUTED, gap: 4 },
  );
  w.text(
    "Este aceite libera as etapas que podem andar antes da assinatura do contrato (pedido de documentos médicos e Poupatempo). Ele NÃO substitui a assinatura do contrato e da procuração, que continua obrigatória nas etapas seguintes.",
    { size: 8, color: MUTED },
  );

  if (input.termsLines.length) {
    w.page = doc.addPage([A4.w, A4.h]);
    w.page.drawText(pdfText(`${input.company} · Comprovante ${input.code} · Termos ${input.termsVersion}`), { x: MARGIN, y: 28, size: 7.5, font: fonts.regular, color: MUTED });
    w.y = A4.h - MARGIN;
    w.text(`TEXTO DOS TERMOS ACEITOS (${input.termsVersion}) — como exibido ao cliente no WhatsApp`, { size: 9, bold: true, color: ACCENT, gap: 8 });
    for (const line of input.termsLines) termsLine(w, line);
  }

  return doc.save();
}

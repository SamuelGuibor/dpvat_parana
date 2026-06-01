"use server";

import { PDFDocument, rgb, PDFPage } from "pdf-lib";

interface PDFData {
  nome?: string;
  cpf?: string;
  email?: string;
  telefone?: string;
  data_nascimento?: string;
  data_acidente?: string;
  lesoes?: string;
  hospital?: string;
  endereco?: string;
  estado_civil?: string;
  rg?: string;
  nome_mae?: string;
  [key: string]: string | undefined;
}

export async function generatePDFFromTemplate(
  data: PDFData,
  titulo: string = "Roteiro Processual"
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size

  const { height } = page.getSize();
  let yPosition = height - 50;

  const fontSize = 11;
  const headerSize = 16;
  const fieldLabelSize = 10;

  // Título
  page.drawText(titulo, {
    x: 50,
    y: yPosition,
    size: headerSize,
    color: rgb(0, 0, 0),
    maxWidth: 495,
  });
  yPosition -= 40;

  // Linha separadora
  page.drawLine({
    start: { x: 50, y: yPosition },
    end: { x: 545, y: yPosition },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  yPosition -= 20;

  // Dados do cliente
  const fields = [
    { label: "Nome Completo", value: data.nome },
    { label: "CPF", value: maskCPF(data.cpf) },
    { label: "RG/CNH", value: data.rg },
    { label: "Nome da Mãe", value: data.nome_mae },
    { label: "Data de Nascimento", value: data.data_nascimento },
    { label: "Estado Civil", value: data.estado_civil },
    { label: "Email", value: data.email },
    { label: "Telefone", value: data.telefone },
    { label: "Endereço", value: data.endereco },
    { label: "Data do Acidente", value: data.data_acidente },
    { label: "Lesões", value: data.lesoes },
    { label: "Hospital", value: data.hospital },
  ];

  // Desenhar campos
  for (const field of fields) {
    if (!field.value) continue;

    // Label
    page.drawText(field.label + ":", {
      x: 50,
      y: yPosition,
      size: fieldLabelSize,
      color: rgb(100, 100, 100),
    });
    yPosition -= 18;

    // Valor
    const lines = wrapText(field.value, 90);
    for (const line of lines) {
      page.drawText(line, {
        x: 70,
        y: yPosition,
        size: fontSize,
        color: rgb(0, 0, 0),
      });
      yPosition -= 15;
    }

    yPosition -= 10;

    // Se está perto do final da página, cria nova página
    if (yPosition < 100) {
      yPosition = height - 50;
      pdfDoc.addPage([595, 842]);
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

export async function generatePDFFromText(
  content: string,
  titulo: string = "Documento"
): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]); // A4 size
  const { height } = page.getSize();

  let yPosition = height - 50;
  const fontSize = 11;
  const headerSize = 16;
  const lineHeight = 16;

  // Título
  page.drawText(titulo, {
    x: 50,
    y: yPosition,
    size: headerSize,
    color: rgb(0, 0, 0),
    maxWidth: 495,
  });
  yPosition -= 40;

  // Linha separadora
  page.drawLine({
    start: { x: 50, y: yPosition },
    end: { x: 545, y: yPosition },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  yPosition -= 30;

  // Conteúdo
  const lines = content.split("\n");
  for (const line of lines) {
    if (!line.trim()) {
      yPosition -= 10;
      continue;
    }

    const wrappedLines = wrapText(line, 90);
    for (const wrappedLine of wrappedLines) {
      page.drawText(wrappedLine, {
        x: 50,
        y: yPosition,
        size: fontSize,
        color: rgb(0, 0, 0),
        maxWidth: 495,
      });
      yPosition -= lineHeight;
    }

    if (yPosition < 100) {
      const newPage = pdfDoc.addPage([595, 842]);
      yPosition = newPage.getHeight() - 50;
    }
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

function maskCPF(cpf?: string): string {
  if (!cpf) return "";
  const clean = cpf.replace(/\D/g, "");
  return `****${clean.slice(-4)}`;
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if ((currentLine + word).length > maxCharsPerLine) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word;
    } else {
      currentLine += (currentLine ? " " : "") + word;
    }
  }

  if (currentLine) lines.push(currentLine.trim());
  return lines;
}

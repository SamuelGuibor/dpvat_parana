import { describe, it, expect } from "vitest";
import { writeFileSync } from "fs";
import { PDFDocument } from "pdf-lib";
import { buildTermsReceiptPdf, pdfText } from "@/app/_shared/lib/terms/receipt-pdf";

// Comprovante de aceite (T-B40K0): a Helvetica padrão do pdf-lib só codifica
// WinAnsi — emoji/símbolo no nome do cliente ou no termo não pode quebrar a
// geração. DUMP_TERMS_PDF=<caminho> grava o PDF para conferir a olho.

describe("comprovante de aceite em PDF", () => {
  it("texto fora do WinAnsi some ou vira equivalente; acento fica", () => {
    expect(pdfText("João 😀 → ok · “aspas” — ç")).toBe("João  -> ok · “aspas” — ç");
  });

  it("gera o PDF com o registro e o termo em páginas seguintes", async () => {
    const termsLines = [
      "# TERMO DE ACEITE DE SERVIÇOS",
      "Versão v1",
      "**ATENÇÃO: ESTE SERVIÇO É EXCLUSIVAMENTE ADMINISTRATIVO.**",
      "## 1. Objeto",
      ...Array.from({ length: 40 }, (_, i) => `- Item ${i + 1}: solicitar e retirar prontuário, Boletim de Atendimento Médico (BAM) e demais documentos médicos em hospitais de todo o território nacional, podendo pagar as custas de emissão.`),
    ];
    const pdf = await buildTermsReceiptPdf({
      documentId: "4f0c1d2e-0000-4000-8000-000000000000",
      code: "AB2C-DE3F-GH4J",
      verifyUrl: "https://www.brasilbeneficiosbr.com/verificar/aceite/AB2C-DE3F-GH4J",
      recordHash: "a".repeat(64),
      acceptedAt: new Date("2026-11-13T13:42:05Z"),
      phone: "5541999998888",
      lineLabel: "Brasil Benefícios IA",
      waMessageId: "wamid.HBgMNTU0MTk5OTk5ODg4OBUCABIYFjNFQjBDMEE1RkY0QjJBRjI0QjI3RTUA",
      formName: "aceite_termos_servico",
      formVersion: 1,
      metaFlowId: "1234567890",
      termsVersion: "v1",
      name: "Maria José da Conceição 😀",
      cpf: "12345678909",
      healthConsent: true,
      optInLabel: "SIM, autorizo e aceito o Termo de Serviços, incluindo o uso dos meus dados de saúde (cláusula 6)",
      termsLines,
      company: "Brasil Benefícios e Indenizações",
    });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(3);
    if (process.env.DUMP_TERMS_PDF) writeFileSync(process.env.DUMP_TERMS_PDF, pdf);
  });
});

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import QRCode from "qrcode";
import { generateKitPdf, findAnchors, stampSignedPdf, sha256, EXPECTED_SIGNATURE_SPOTS } from "@/app/_shared/lib/signature/pdf";

// SMOKE do motor de PDF — usa o docx-converter DE VERDADE, por isso não roda no
// `npm test` normal. Para rodar e ver o resultado:
//
//   npm run sign:pdf
//
// Ele grava dois arquivos na área temporária e imprime o caminho: abra o
// "-assinado.pdf" e confira se a assinatura caiu em cima das 3 linhas.

// Roda por `npm run sign:pdf` (funciona em qualquer shell) ou com a
// variável SIGNATURE_SMOKE=1 no ambiente.
const ativo = process.env.SIGNATURE_SMOKE === "1" || process.env.npm_lifecycle_event === "sign:pdf";

const DADOS = {
  name: "MARIA APARECIDA DA SILVA",
  nacionalidade: "brasileira",
  estado_civil: "casada",
  profissao: "auxiliar de limpeza",
  rg: "12.345.678-9",
  cpf: "111.444.777-35",
  rua: "Rua das Flores",
  numero: "120",
  bairro: "Boqueirão",
  cep: "81730-000",
  cidade: "Curitiba",
  estado: "Paraná",
  data: "18/08/2026",
};

describe.skipIf(!ativo)("motor de PDF da assinatura", () => {
  it("preenche os 3 arquivos, acha as âncoras e carimba a assinatura", async () => {
    const pdf = await generateKitPdf(DADOS);
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");

    const hash = sha256(pdf);
    expect(hash).toHaveLength(64);

    const spots = await findAnchors(pdf);
    console.log(`âncoras encontradas: ${spots.length}`, spots.map((s) => ({
      pagina: s.pageIndex + 1,
      x: Math.round(s.anchor.x),
      y: Math.round(s.anchor.y),
      linha: s.line ? `x=${Math.round(s.line.x)} w=${Math.round(s.line.width)}` : "não achou a linha",
    })));
    expect(spots.length).toBe(EXPECTED_SIGNATURE_SPOTS);
    expect(spots.every((s) => s.line !== null)).toBe(true);

    // Placeholder de assinatura (o desenho real vem do canvas do navegador).
    const signaturePng = await QRCode.toBuffer("assinatura-de-teste", { margin: 0, width: 160 });

    const assinado = await stampSignedPdf({
      pdf,
      signaturePng,
      signerName: DADOS.name,
      cpf: DADOS.cpf,
      token: "tokendetestetokendetes",
      documentHash: hash,
      auditLines: [
        { label: "Link aberto em", value: "18/08/2026 14:20 (BRT)" },
        { label: "IP do signatário", value: "189.45.12.9" },
        { label: "Dispositivo", value: "Android 14 — Chrome 120" },
        { label: "Telefone verificado por código", value: "+55 41 99999-9999 às 14:31" },
        { label: "Aceite do termo", value: "Ao confirmar, você assina os 3 documentos eletronicamente." },
      ],
      signedAt: new Date("2026-08-18T17:32:00Z"),
    });

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "assinatura-"));
    const original = path.join(dir, "kit-original.pdf");
    const final = path.join(dir, "kit-assinado.pdf");
    fs.writeFileSync(original, pdf);
    fs.writeFileSync(final, assinado);
    console.log(`\nPDFs gerados:\n  ${original}\n  ${final}\n`);

    expect(assinado.length).toBeGreaterThan(pdf.length);
  }, 180_000);
});

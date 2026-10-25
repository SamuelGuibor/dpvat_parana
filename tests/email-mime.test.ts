import { describe, it, expect } from "vitest";
import { base64Lines, buildMimeMessage, encodeHeaderWord, isValidEmail, mimeTypeFor } from "@/app/_shared/utils/email-mime";

const base = {
  from: "Seguros Paraná <nao-responda@segurosparana.com.br>",
  to: ["Samelaudos@Hospital.org.br"],
  subject: "Solicitação de prontuário — Ana",
  text: "Bom dia.\nSegue o pedido.",
  boundary: "BOUND",
  date: new Date("2026-10-25T12:00:00Z"),
};

function decodePart(raw: string, marker: string): string {
  const i = raw.indexOf(marker);
  const body = raw.slice(raw.indexOf("\r\n\r\n", i) + 4, raw.indexOf("\r\n--BOUND", i));
  return Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8");
}

describe("MIME do e-mail aprovado", () => {
  it("cabeçalhos com cc, assunto UTF-8 e destinatário normalizado", () => {
    const raw = buildMimeMessage({ ...base, cc: ["equipe@segurosparana.com.br"] });
    expect(raw).toContain("To: samelaudos@hospital.org.br\r\n");
    expect(raw).toContain("Cc: equipe@segurosparana.com.br\r\n");
    expect(raw).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(raw).toContain('Content-Type: multipart/mixed; boundary="BOUND"');
    expect(raw.endsWith("--BOUND--\r\n")).toBe(true);
    expect(decodePart(raw, "text/plain")).toBe("Bom dia.\nSegue o pedido.");
  });

  it("anexo com acento: filename ASCII + filename* UTF-8, base64 em linhas de 76", () => {
    const data = Buffer.alloc(200, 7);
    const raw = buildMimeMessage({ ...base, attachments: [{ name: "Procuração Ana.pdf", contentType: "application/pdf", data }] });
    expect(raw).toContain('Content-Disposition: attachment; filename="Procuracao Ana.pdf"; filename*=UTF-8\'\'Procura%C3%A7%C3%A3o%20Ana.pdf');
    expect(raw).toContain("Content-Type: application/pdf");
    const lines = base64Lines(data).split("\r\n");
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(76);
    expect(raw).toContain(lines[0]);
  });

  it("recusa injeção de cabeçalho e endereço inválido", () => {
    expect(() => buildMimeMessage({ ...base, subject: "Oi\r\nBcc: x@y.com" })).toThrow();
    expect(() => buildMimeMessage({ ...base, to: ["a@b.com\r\nBcc: c@d.com"] })).toThrow();
    expect(() => buildMimeMessage({ ...base, to: ["sem-arroba"] })).toThrow();
    expect(() => buildMimeMessage({ ...base, to: [] })).toThrow();
  });

  it("utilitários", () => {
    expect(isValidEmail("a.b@hosp.com.br")).toBe(true);
    expect(isValidEmail("a b@hosp.com")).toBe(false);
    expect(isValidEmail("a@hosp")).toBe(false);
    expect(encodeHeaderWord("Pedido 123")).toBe("Pedido 123");
    expect(encodeHeaderWord("ção")).toMatch(/^=\?UTF-8\?B\?/);
    expect(mimeTypeFor("X.PDF")).toBe("application/pdf");
    expect(mimeTypeFor("foto.jpeg")).toBe("image/jpeg");
    expect(mimeTypeFor("arquivo")).toBe("application/octet-stream");
  });
});

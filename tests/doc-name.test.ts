import { describe, expect, it } from "vitest";
import { ensureDocExtension, extensionFromKey, sanitizeDocName } from "@/app/_shared/utils/doc-name";

// Renomear documento troca só o nome (a key do S3 pode ser a mesma da mensagem
// do WhatsApp). O nome vai no header Content-Disposition do download, então
// precisa manter a extensão real e não pode carregar caractere que quebra o header.

describe("ensureDocExtension", () => {
  it("acrescenta a extensão da key", () => {
    expect(ensureDocExtension("RG frente", "whatsapp/c/1-midia.jpeg")).toBe("RG frente.jpeg");
  });

  it("não duplica extensão que já está no nome (ignora caixa)", () => {
    expect(ensureDocExtension("rg.JPEG", "whatsapp/c/1-midia.jpeg")).toBe("rg.JPEG");
  });

  it("key sem extensão devolve só o nome limpo", () => {
    expect(ensureDocExtension("  Comprovante  ", "uploads/user_x/1-arquivo")).toBe("Comprovante");
  });

  it("tira aspas, barras e contrabarra", () => {
    expect(ensureDocExtension('a"b/c', "x.pdf")).toBe("abc.pdf");
    expect(ensureDocExtension("a\\b", "x.pdf")).toBe("ab.pdf");
  });

  it("tira \\r, \\n e ; (injeção no header)", () => {
    expect(ensureDocExtension("laudo\r\nX-Evil: 1; filename=a", "uploads/p/1-l.pdf")).toBe("laudoX-Evil: 1 filename=a.pdf");
  });

  it("mantém acento e apóstrofo de nome próprio", () => {
    expect(ensureDocExtension("Comprovante D'Ávila", "uploads/p/1-c.pdf")).toBe("Comprovante D'Ávila.pdf");
  });

  it("nome que some na limpeza vira vazio (quem chama recusa)", () => {
    expect(ensureDocExtension(' "/; ', "whatsapp/c/1-midia.jpeg")).toBe("");
  });

  it("ponto em pasta da key não vira extensão", () => {
    expect(ensureDocExtension("RG", "uploads/user_a.b/1-arquivo")).toBe("RG");
  });
});

describe("extensionFromKey", () => {
  it("pega a extensão do último segmento", () => {
    expect(extensionFromKey("whatsapp/cmabc/docs/1-x.PDF")).toBe(".PDF");
    expect(extensionFromKey("whatsapp/cmabc/1-DOC-123..pdf")).toBe(".pdf");
  });

  it("sem extensão, arquivo oculto ou ponto final = vazio", () => {
    expect(extensionFromKey("uploads/u/1-arquivo")).toBe("");
    expect(extensionFromKey("uploads/u/.oculto")).toBe("");
    expect(extensionFromKey("uploads/u/1-arquivo.")).toBe("");
  });
});

describe("sanitizeDocName", () => {
  it("tira tab e outros caracteres de controle", () => {
    expect(sanitizeDocName("a\tb\u0000c\u007f")).toBe("abc");
  });
});

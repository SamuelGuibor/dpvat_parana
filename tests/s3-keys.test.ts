import { describe, expect, it } from "vitest";
import {
  cardUploadKey,
  contactIdFromWhatsAppKey,
  contentDisposition,
  fileNameFromKey,
  hasTraversalSegment,
  isAllowedKeyPrefix,
  isSharedLibraryKey,
  signingWindow,
} from "@/app/_shared/utils/s3-keys";

// A purga da lixeira preserva o objeto do S3 quando a key é de biblioteca
// compartilhada (vídeo de fluxo, mídia de template): apagar quebraria o passo
// do fluxo para todos os próximos leads e todas as threads antigas.

describe("isSharedLibraryKey", () => {
  it("fluxos e templates do WhatsApp são compartilhados", () => {
    expect(isSharedLibraryKey("whatsapp/flows/1-v.mp4")).toBe(true);
    expect(isSharedLibraryKey("whatsapp/templates/1-cabecalho.jpg")).toBe(true);
  });

  it("mídia de contato e upload do card não são", () => {
    expect(isSharedLibraryKey("whatsapp/abc/1-midia.jpeg")).toBe(false);
    expect(isSharedLibraryKey("uploads/user_x/1-a.pdf")).toBe(false);
    // Prefixo parecido, mas é um contato qualquer.
    expect(isSharedLibraryKey("whatsapp/flowsx/1-a.pdf")).toBe(false);
  });
});

describe("contactIdFromWhatsAppKey", () => {
  it("devolve o segundo segmento de whatsapp/<cid>/...", () => {
    expect(contactIdFromWhatsAppKey("whatsapp/cmabc/1-midia.jpeg")).toBe("cmabc");
    expect(contactIdFromWhatsAppKey("whatsapp/cmabc/docs/1-x.pdf")).toBe("cmabc");
    expect(contactIdFromWhatsAppKey("whatsapp/cmabc/out-1-foto.jpg")).toBe("cmabc");
  });

  it("biblioteca compartilhada e outros prefixos devolvem null", () => {
    expect(contactIdFromWhatsAppKey("whatsapp/flows/1-v.mp4")).toBeNull();
    expect(contactIdFromWhatsAppKey("whatsapp/templates/1-h.jpg")).toBeNull();
    expect(contactIdFromWhatsAppKey("uploads/user_x/1-a.pdf")).toBeNull();
  });

  it("key incompleta devolve null", () => {
    expect(contactIdFromWhatsAppKey("whatsapp/cmabc")).toBeNull();
    expect(contactIdFromWhatsAppKey("whatsapp//1-a.pdf")).toBeNull();
    expect(contactIdFromWhatsAppKey("whatsapp/cmabc/")).toBeNull();
  });
});

// Upload da aba Arquivos: antes a key era `<Date.now()>-<nome>` calculada
// dentro do Promise.all, então dois arquivos de mesmo nome no mesmo lote caíam
// na mesma key e o 2º PUT sobrescrevia o 1º.
describe("cardUploadKey", () => {
  it("mesmo nome no mesmo lote gera keys diferentes", () => {
    const ts = 1_758_800_000_000;
    const a = cardUploadKey("cu1", false, ts, 0, "rg.pdf");
    const b = cardUploadKey("cu1", false, ts, 1, "rg.pdf");
    expect(a).not.toBe(b);
    expect(a).toBe(`uploads/user_cu1/${ts}-rg.pdf`);
    expect(b).toBe(`uploads/user_cu1/${ts + 1}-rg.pdf`);
  });

  it("mantém o formato <número>-<nome> e o prefixo por tipo de card", () => {
    const key = cardUploadKey("p9", true, 1_758_800_000_000, 3, "laudo final.pdf");
    expect(key).toBe("uploads/process_p9/1758800000003-laudo final.pdf");
    expect(key.split("/").pop()).toMatch(/^\d{10,}-laudo final\.pdf$/);
    // Não é mídia de contato nem biblioteca compartilhada.
    expect(isSharedLibraryKey(key)).toBe(false);
    expect(contactIdFromWhatsAppKey(key)).toBeNull();
  });
});

// Allowlist de leitura: a mesma regra vale para downloadFileFromS3 (invocável
// de página pública) e para o assinador da thread (s3-presign.ts).
describe("isAllowedKeyPrefix", () => {
  it("aceita prefixos do app, inclusive nome com ponto duplo", () => {
    expect(isAllowedKeyPrefix("whatsapp/c/1-DOC-123..pdf")).toBe(true);
    expect(isAllowedKeyPrefix("uploads/user_x/1-rg.pdf")).toBe(true);
    expect(isAllowedKeyPrefix("dev-tickets/a.png")).toBe(true);
  });

  it("recusa traversal por segmento, prefixo desconhecido e key vazia", () => {
    expect(isAllowedKeyPrefix("whatsapp/../x")).toBe(false);
    expect(isAllowedKeyPrefix("uploads/../../segredo")).toBe(false);
    expect(isAllowedKeyPrefix("outro/x")).toBe(false);
    expect(isAllowedKeyPrefix("xwhatsapp/c/1.pdf")).toBe(false);
    expect(isAllowedKeyPrefix("")).toBe(false);
  });

  it("traversal é o segmento '..', não qualquer ponto duplo", () => {
    expect(hasTraversalSegment("whatsapp/../x")).toBe(true);
    expect(hasTraversalSegment("whatsapp/c/1-DOC-123..pdf")).toBe(false);
  });
});

describe("fileNameFromKey", () => {
  it("tira o timestamp e decodifica", () => {
    expect(fileNameFromKey("whatsapp/abc/1720000000000-contrato.pdf")).toBe("contrato.pdf");
    expect(fileNameFromKey("whatsapp/abc/1720000000000-comprovante%20de%20endere%C3%A7o.pdf")).toBe(
      "comprovante de endereço.pdf",
    );
  });

  it("key sem timestamp ou com escape inválido volta crua", () => {
    expect(fileNameFromKey("whatsapp/abc/out-foto.jpg")).toBe("out-foto.jpg");
    expect(fileNameFromKey("whatsapp/abc/1720000000000-100%.pdf")).toBe("100%.pdf");
    expect(fileNameFromKey("whatsapp/abc/")).toBe("arquivo");
  });
});

// Janela estável: a thread faz poll a cada 8 s e a URL não pode mudar a cada
// poll (o <img> recarregaria e piscaria).
describe("signingWindow", () => {
  const at = (h: number, m: number) => Date.UTC(2026, 8, 25, h, m, 0);

  it("mesma signingDate dentro da janela de 30 min, outra depois", () => {
    const a = signingWindow(at(12, 1));
    const b = signingWindow(at(12, 29));
    const c = signingWindow(at(12, 31));
    expect(a.signingDate.getTime()).toBe(b.signingDate.getTime());
    expect(a.signingDate.getTime()).toBe(at(12, 0));
    expect(c.signingDate.getTime()).not.toBe(a.signingDate.getTime());
    expect(c.signingDate.getTime()).toBe(at(12, 30));
  });

  it("aceita Date e deixa ≥ 60 min de validade em todo ponto da janela", () => {
    expect(signingWindow(new Date(at(12, 1))).signingDate.getTime()).toBe(at(12, 0));
    for (let s = 0; s < 30 * 60; s += 7) {
      const now = at(12, 0) + s * 1000;
      const { signingDate, expiresAt } = signingWindow(now);
      expect(signingDate.getTime()).toBeLessThanOrEqual(now);
      expect(expiresAt.getTime() - now).toBeGreaterThanOrEqual(60 * 60_000);
    }
  });
});

describe("contentDisposition", () => {
  it("manda filename* em UTF-8 para acento e fallback ASCII", () => {
    const h = contentDisposition(true, "COMPROVANTE DE ENDEREÇO.pdf");
    expect(h.startsWith("inline; ")).toBe(true);
    expect(h).toContain("filename*=UTF-8''COMPROVANTE%20DE%20ENDERE%C3%87O.pdf");
    expect(h).toContain('filename="COMPROVANTE DE ENDERECO.pdf"');
  });

  it("attachment para download", () => {
    expect(contentDisposition(false, "rg.pdf")).toBe(`attachment; filename="rg.pdf"; filename*=UTF-8''rg.pdf`);
  });

  it("fallback ASCII sem aspas, ; ou \\ dentro do valor e sem quebra de linha", () => {
    const h = contentDisposition(true, 'a"b;c\\d\r\nX-Evil: 1.pdf');
    const fallback = /filename="([^"]*)"/.exec(h)?.[1] ?? "";
    expect(fallback).toBe("abcdX-Evil: 1.pdf");
    expect(h).not.toMatch(/[\r\n]/);
    // Só as aspas que delimitam o fallback.
    expect(h.split('"').length - 1).toBe(2);
  });

  it("nome vazio vira 'arquivo'", () => {
    expect(contentDisposition(true, "")).toBe(`inline; filename="arquivo"; filename*=UTF-8''arquivo`);
  });
});

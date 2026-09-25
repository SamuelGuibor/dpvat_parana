import { describe, expect, it } from "vitest";
import { contactIdFromWhatsAppKey, isSharedLibraryKey } from "@/app/_shared/utils/s3-keys";

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

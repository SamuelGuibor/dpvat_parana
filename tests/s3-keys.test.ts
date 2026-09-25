import { describe, expect, it } from "vitest";
import { cardUploadKey, contactIdFromWhatsAppKey, isSharedLibraryKey } from "@/app/_shared/utils/s3-keys";

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

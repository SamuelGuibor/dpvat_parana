import { describe, expect, it } from "vitest";
import { mediaTypeLabel } from "@/app/_shared/utils/whatsapp-inbox";

// Regras puras da lista do inbox: a prévia da última mensagem sai do servidor
// (loadConversations) e, nas ações com patch local, do próprio navegador. As
// duas usam as mesmas funções para a linha não "pular" quando o hash recarrega.

describe("mediaTypeLabel", () => {
  it("dá o nome curto de cada tipo de mídia", () => {
    expect(mediaTypeLabel("image/jpeg")).toBe("Foto");
    expect(mediaTypeLabel("image/webp")).toBe("Foto");
    expect(mediaTypeLabel("video/mp4")).toBe("Vídeo");
    expect(mediaTypeLabel("audio/ogg")).toBe("Áudio");
    expect(mediaTypeLabel("audio/ogg; codecs=opus")).toBe("Áudio");
  });

  it("qualquer outro tipo vira Documento", () => {
    expect(mediaTypeLabel("application/pdf")).toBe("Documento");
    expect(mediaTypeLabel("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("Documento");
    expect(mediaTypeLabel("")).toBe("Documento");
  });
});

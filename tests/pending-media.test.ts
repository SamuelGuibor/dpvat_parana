import { describe, expect, it } from "vitest";
import {
  RETRY_CHECK_FAILED_TEXT,
  RETRY_WINDOW_CLOSED_TEXT,
  findSentMedia,
  mediaSendFailedText,
  pendingPreviewKind,
} from "@/app/_shared/utils/pending-media";

// Bolha pendente de mídia do inbox (auditoria de 24/09/2026, DOC-9): preview
// enquanto sobe e "tentar de novo" sem reanexar e sem mandar a foto 2 vezes.

const KEY = "whatsapp/c1/out-1727200000000-foto.jpg";

function msg(id: string, direction: "in" | "out", mediaKey: string | null) {
  return { id, direction, mediaKey };
}

describe("findSentMedia", () => {
  it("acha a mensagem enviada com a key do upload (a action respondeu mas a resposta se perdeu)", () => {
    const thread = [msg("a", "in", null), msg("b", "out", "whatsapp/c1/out-1-outra.jpg"), msg("c", "out", KEY)];
    expect(findSentMedia(thread, KEY)?.id).toBe("c");
  });

  it("sem mensagem com a key: não foi enviada, o retry reenvia", () => {
    expect(findSentMedia([msg("a", "out", "whatsapp/c1/out-1-outra.jpg")], KEY)).toBeNull();
    expect(findSentMedia([], KEY)).toBeNull();
  });

  it("sem key (o PUT nem terminou): nada a conferir", () => {
    expect(findSentMedia([msg("c", "out", KEY)], undefined)).toBeNull();
    expect(findSentMedia([msg("c", "out", KEY)], null)).toBeNull();
    expect(findSentMedia([msg("c", "out", KEY)], "")).toBeNull();
  });

  it("só conta mensagem de SAÍDA: recebida com a mesma key não prova o envio", () => {
    expect(findSentMedia([msg("x", "in", KEY)], KEY)).toBeNull();
  });

  it("apagada no CRM ainda conta como enviada (o cliente recebeu)", () => {
    const apagada = { ...msg("d", "out", KEY), deletedAt: "2026-09-25T12:00:00.000Z" };
    expect(findSentMedia([apagada], KEY)).toBe(apagada);
  });
});

describe("pendingPreviewKind", () => {
  it("imagem vira preview; o resto mostra o nome", () => {
    expect(pendingPreviewKind("image/jpeg")).toBe("image");
    expect(pendingPreviewKind("image/heic")).toBe("image"); // o onError da bolha cai no nome
    expect(pendingPreviewKind("application/pdf")).toBe("file");
    expect(pendingPreviewKind("video/mp4")).toBe("file");
    expect(pendingPreviewKind("audio/ogg")).toBe("file");
    expect(pendingPreviewKind(null)).toBe("file");
    expect(pendingPreviewKind(undefined)).toBe("file");
  });
});

describe("textos da falha", () => {
  it("texto próprio com o nome do arquivo e a etapa (erro de action chega mascarado)", () => {
    expect(mediaSendFailedText("RG frente.jpg", "upload")).toContain('subir "RG frente.jpg"');
    expect(mediaSendFailedText("RG frente.jpg", "send")).toContain('enviar "RG frente.jpg"');
    expect(mediaSendFailedText("RG frente.jpg", "send")).toContain("tentar de novo");
  });

  it("nome vazio não deixa aspas vazias", () => {
    expect(mediaSendFailedText("  ", "send")).toContain('"anexo"');
  });

  it("janela fechada orienta o template; conferência falha pede para tentar de novo", () => {
    expect(RETRY_WINDOW_CLOSED_TEXT).toContain("template");
    expect(RETRY_CHECK_FAILED_TEXT).toContain("tente de novo");
  });
});

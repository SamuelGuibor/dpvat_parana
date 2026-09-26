import { describe, expect, it } from "vitest";
import { batchMediaNames, cleanBaseName, mediaDisplayName, mediaKindLabel } from "@/app/_shared/utils/media-name";
import { brDateTimeParts } from "@/app/_shared/utils/date-br";
import { inferCategory } from "@/app/_shared/lib/document-categories";

// 02:30 UTC de 25/09 = 23:30 de 24/09 em Brasília: o nome precisa sair com o
// dia de Brasília, não o dia UTC em que a Vercel roda.
const AT = "2026-09-25T02:30:00Z";

describe("mediaDisplayName — nome inventado vira rótulo + data de Brasília", () => {
  it("foto recebida sem nome (midia.jpeg)", () => {
    expect(
      mediaDisplayName({ key: "whatsapp/c/1727000000000-midia.jpeg", mediaType: "image/jpeg", createdAt: AT }),
    ).toBe("Foto 24-09-2026 23h30m00.jpeg");
  });

  it("áudio recebido (midia.ogg) e áudio 'audio.ogg'", () => {
    expect(
      mediaDisplayName({ key: "whatsapp/c/1727000000000-midia.ogg", mediaType: "audio/ogg; codecs=opus", createdAt: AT }),
    ).toBe("Áudio 24-09-2026 23h30m00.ogg");
    expect(
      mediaDisplayName({ key: "whatsapp/c/1727000000000-audio.ogg", mediaType: "audio/ogg", createdAt: AT }),
    ).toBe("Áudio 24-09-2026 23h30m00.ogg");
  });

  it("áudio gravado pelo atendente (out-<ts>-audio.ogg e out-<ts>-audio-<ts>.ogg)", () => {
    expect(
      mediaDisplayName({ key: "whatsapp/c/out-1727000000000-audio.ogg", mediaType: "audio/ogg", createdAt: AT }),
    ).toBe("Áudio 24-09-2026 23h30m00.ogg");
    expect(
      mediaDisplayName({
        key: "whatsapp/c/out-1727000000000-audio-1726999999000.ogg",
        mediaType: "audio/ogg",
        createdAt: AT,
      }),
    ).toBe("Áudio 24-09-2026 23h30m00.ogg");
  });

  it("vídeo, figurinha (image/webp) e documento sem nome", () => {
    expect(
      mediaDisplayName({ key: "whatsapp/c/1727000000000-midia.mp4", mediaType: "video/mp4", createdAt: AT }),
    ).toBe("Vídeo 24-09-2026 23h30m00.mp4");
    expect(
      mediaDisplayName({ key: "whatsapp/c/1727000000000-midia.webp", mediaType: "image/webp", createdAt: AT }),
    ).toBe("Figurinha 24-09-2026 23h30m00.webp");
    expect(
      mediaDisplayName({ key: "whatsapp/c/1727000000000-midia.pdf", mediaType: "application/pdf", createdAt: AT }),
    ).toBe("Documento 24-09-2026 23h30m00.pdf");
  });

  it("os segundos entram no nome: frente e verso no mesmo minuto não colidem", () => {
    const frente = mediaDisplayName({
      key: "whatsapp/c/1727000000000-midia.jpeg", mediaType: "image/jpeg", createdAt: "2026-09-24T17:32:05Z",
    });
    const verso = mediaDisplayName({
      key: "whatsapp/c/1727000000001-midia.jpeg", mediaType: "image/jpeg", createdAt: "2026-09-24T17:32:41Z",
    });
    expect(frente).toBe("Foto 24-09-2026 14h32m05.jpeg");
    expect(verso).toBe("Foto 24-09-2026 14h32m41.jpeg");
  });

  it("aceita Date e epoch, com meia-noite em 00h", () => {
    const d = new Date("2026-09-25T03:00:07Z"); // 00:00:07 de 25/09 em Brasília
    expect(mediaDisplayName({ key: "whatsapp/c/1727000000000-midia.jpeg", mediaType: "image/jpeg", createdAt: d }))
      .toBe("Foto 25-09-2026 00h00m07.jpeg");
    expect(mediaDisplayName({ key: "whatsapp/c/1727000000000-midia.jpeg", mediaType: "image/jpeg", createdAt: d.getTime() }))
      .toBe("Foto 25-09-2026 00h00m07.jpeg");
  });

  it("imagem colada (image.png) enviada pelo atendente também é nome inventado", () => {
    expect(
      mediaDisplayName({ key: "whatsapp/c/out-1727000000000-image.png", mediaType: "image/png", createdAt: AT }),
    ).toBe("Foto 24-09-2026 23h30m00.png");
  });

  it("nome vazio usa a extensão do MIME; sem MIME, o rótulo sai da extensão", () => {
    expect(mediaDisplayName({ key: "whatsapp/c/1727000000000-", mediaType: "image/jpeg", createdAt: AT }))
      .toBe("Foto 24-09-2026 23h30m00.jpeg");
    expect(mediaDisplayName({ key: "whatsapp/c/1727000000000-midia.ogg", mediaType: null, createdAt: AT }))
      .toBe("Áudio 24-09-2026 23h30m00.ogg");
    expect(mediaDisplayName({ key: "", mediaType: null, createdAt: AT })).toBe("Documento 24-09-2026 23h30m00");
  });

  it("data inválida não lança", () => {
    expect(mediaDisplayName({ key: "whatsapp/c/1727000000000-midia.jpeg", mediaType: "image/jpeg", createdAt: "x" }))
      .toBe("Foto.jpeg");
  });
});

describe("mediaDisplayName — nome dado por alguém é preservado", () => {
  it("PDF do cliente: tira o prefixo e troca '_' por espaço", () => {
    expect(
      mediaDisplayName({ key: "whatsapp/c/1727000000000-Laudo_hospital.pdf", mediaType: "application/pdf", createdAt: AT }),
    ).toBe("Laudo hospital.pdf");
    expect(
      mediaDisplayName({
        key: "whatsapp/c/1727000000000-carta-concessao-beneficio__1_.pdf",
        mediaType: "application/pdf",
        createdAt: AT,
      }),
    ).toBe("carta-concessao-beneficio 1.pdf");
  });

  it("anexo do atendente (out-<ts>-<nome>) e mídia de fluxo", () => {
    expect(
      mediaDisplayName({ key: "whatsapp/c/out-1727000000000-comprovante.pdf", mediaType: "application/pdf", createdAt: AT }),
    ).toBe("comprovante.pdf");
    expect(
      mediaDisplayName({ key: "whatsapp/flows/1727000000000-TUTORIAL_-_DOCS_INSS.mp4", mediaType: "video/mp4", createdAt: AT }),
    ).toBe("TUTORIAL - DOCS INSS.mp4");
  });

  it("keys da assinatura (sem prefixo de timestamp) ficam como estão", () => {
    expect(
      mediaDisplayName({ key: "whatsapp/c/contrato-kit-1727000000000.pdf", mediaType: "application/pdf", createdAt: AT }),
    ).toBe("contrato-kit-1727000000000.pdf");
    expect(
      mediaDisplayName({ key: "whatsapp/c/assinatura-1727000000000.png", mediaType: "image/png", createdAt: AT }),
    ).toBe("assinatura-1727000000000.png");
  });

  it("nome que só começa com 'midia'/'audio' não é tratado como inventado", () => {
    expect(
      mediaDisplayName({ key: "whatsapp/c/1727000000000-audiometria.pdf", mediaType: "application/pdf", createdAt: AT }),
    ).toBe("audiometria.pdf");
    expect(
      mediaDisplayName({ key: "whatsapp/c/1727000000000-midia_rg.jpeg", mediaType: "image/jpeg", createdAt: AT }),
    ).toBe("midia rg.jpeg");
  });

  it("decodeURIComponent inválido não lança", () => {
    expect(
      mediaDisplayName({ key: "whatsapp/c/1727000000000-100%.pdf", mediaType: "application/pdf", createdAt: AT }),
    ).toBe("100%.pdf");
    expect(
      mediaDisplayName({
        key: "whatsapp/c/1727000000000-comprovante%20de%20endere%C3%A7o.pdf",
        mediaType: "application/pdf",
        createdAt: AT,
      }),
    ).toBe("comprovante de endereço.pdf");
  });
});

describe("mediaKindLabel", () => {
  it("pelo MIME, e pela extensão quando não há MIME", () => {
    expect(mediaKindLabel("image/jpeg")).toBe("Foto");
    expect(mediaKindLabel("image/webp")).toBe("Figurinha");
    expect(mediaKindLabel("video/mp4")).toBe("Vídeo");
    expect(mediaKindLabel("audio/mpeg")).toBe("Áudio");
    expect(mediaKindLabel("application/pdf")).toBe("Documento");
    expect(mediaKindLabel(null, "jpg")).toBe("Foto");
    expect(mediaKindLabel(undefined, "mp4")).toBe("Vídeo");
    expect(mediaKindLabel(null, "pdf")).toBe("Documento");
  });
});

describe("integração com o resto", () => {
  it("brDateTimeParts devolve os segundos à parte, sem mudar o 'time'", () => {
    expect(brDateTimeParts("2026-09-24T17:32:05Z")).toEqual({ day: "2026-09-24", time: "14:32", second: "05" });
  });

  it("o nome padrão cai em OUTROS no attach (inferCategory não confunde o rótulo)", () => {
    for (const n of [
      "Foto 24-09-2026 14h32m05.jpeg",
      "Documento 24-09-2026 14h32m05.pdf",
      "Áudio 24-09-2026 14h32m05.ogg",
      "Vídeo 24-09-2026 14h32m05.mp4",
      "Figurinha 24-09-2026 14h32m05.webp",
    ]) {
      expect(inferCategory(n)).toBe("OUTROS");
    }
  });
});

describe("batchMediaNames — 'Anexar selecionadas' do Copiloto", () => {
  const foto = (ts: string, at: string) => ({ key: `whatsapp/c/${ts}-midia.jpeg`, mediaType: "image/jpeg", createdAt: at });
  const fotos = [
    foto("1727000000000", "2026-09-24T17:32:05Z"),
    foto("1727000000001", "2026-09-24T17:32:09Z"),
    foto("1727000000002", "2026-09-24T17:33:00Z"),
  ];

  it("com nome-base: numera na ordem dada, com a extensão de cada arquivo", () => {
    const pdf = { key: "whatsapp/c/1727000000003-Laudo_hospital.pdf", mediaType: "application/pdf", createdAt: AT };
    expect(batchMediaNames([...fotos, pdf], "DOCUMENTO PESSOAL")).toEqual([
      "DOCUMENTO PESSOAL 1.jpeg",
      "DOCUMENTO PESSOAL 2.jpeg",
      "DOCUMENTO PESSOAL 3.jpeg",
      "DOCUMENTO PESSOAL 4.pdf",
    ]);
  });

  it("uma mídia só não leva número; extensão digitada no nome-base não se repete", () => {
    expect(batchMediaNames([fotos[0]], "DOCUMENTO PESSOAL")).toEqual(["DOCUMENTO PESSOAL.jpeg"]);
    expect(batchMediaNames([fotos[0]], "RG.jpeg")).toEqual(["RG.jpeg"]);
  });

  it("sem nome-base: o nome legível de cada mídia (segundos evitam nomes iguais)", () => {
    expect(batchMediaNames(fotos.slice(0, 2), "   ")).toEqual([
      "Foto 24-09-2026 14h32m05.jpeg",
      "Foto 24-09-2026 14h32m09.jpeg",
    ]);
  });

  it("o nome-base escolhido decide a pasta automática", () => {
    expect(inferCategory(batchMediaNames(fotos, "DOCUMENTO PESSOAL")[0])).toBe("IDENTIFICACAO");
    expect(inferCategory(batchMediaNames(fotos, "LAUDO MÉDICO")[0])).toBe("EXAME_MEDICO");
  });
});

describe("cleanBaseName", () => {
  it("tira o que o Windows e o Content-Disposition recusam, junta espaços e corta em 80", () => {
    expect(cleanBaseName('  RG / CPF: "frente"; verso  ')).toBe("RG CPF frente verso");
    expect(cleanBaseName("comprovante...")).toBe("comprovante");
    expect(cleanBaseName("a".repeat(120))).toHaveLength(80);
    expect(cleanBaseName(null)).toBe("");
    expect(cleanBaseName("\u0000\u001f")).toBe("");
  });
});

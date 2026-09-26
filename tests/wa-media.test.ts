import { describe, expect, it } from "vitest";
import {
  clientDocumentMediaWhere,
  docsReceivedSince,
  isClientDocumentMime,
} from "@/app/_shared/utils/wa-media";

// conversationFacts.docsReceived (bot.ts) diz ao cérebro se o cliente mandou
// documento NESTE atendimento. Antes contava áudio, figurinha e anexos de
// atendimentos já encerrados, e o bot transferia dúvida simples à toa.

describe("isClientDocumentMime", () => {
  it("foto e PDF contam como documento", () => {
    expect(isClientDocumentMime("image/jpeg")).toBe(true);
    expect(isClientDocumentMime("image/png")).toBe(true);
    expect(isClientDocumentMime("image/heic")).toBe(true);
    expect(isClientDocumentMime("application/pdf")).toBe(true);
  });

  it("figurinha (image/webp) não conta", () => {
    expect(isClientDocumentMime("image/webp")).toBe(false);
  });

  it("áudio, vídeo e outros arquivos não contam", () => {
    expect(isClientDocumentMime("audio/ogg; codecs=opus")).toBe(false);
    expect(isClientDocumentMime("audio/ogg")).toBe(false);
    expect(isClientDocumentMime("video/mp4")).toBe(false);
    expect(isClientDocumentMime("application/octet-stream")).toBe(false);
    expect(
      isClientDocumentMime("application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ).toBe(false);
  });

  it("sem tipo não conta", () => {
    expect(isClientDocumentMime(null)).toBe(false);
    expect(isClientDocumentMime(undefined)).toBe(false);
    expect(isClientDocumentMime("")).toBe(false);
  });

  it("ignora parâmetros e maiúsculas do mime", () => {
    expect(isClientDocumentMime("Image/JPEG")).toBe(true);
    expect(isClientDocumentMime("application/pdf; name=rg.pdf")).toBe(true);
    expect(isClientDocumentMime("image/webp; x=1")).toBe(false);
  });
});

describe("clientDocumentMediaWhere", () => {
  it("é o mesmo recorte de isClientDocumentMime (foto sem figurinha + PDF)", () => {
    expect(clientDocumentMediaWhere()).toEqual({
      OR: [
        { mediaType: { startsWith: "image/", not: "image/webp" } },
        { mediaType: "application/pdf" },
      ],
    });
  });
});

describe("docsReceivedSince", () => {
  const jan = new Date("2026-01-10T12:00:00Z");
  const set = new Date("2026-09-01T15:30:00Z");

  it("conversa nunca encerrada: desde a criação", () => {
    expect(docsReceivedSince({ createdAt: jan, closedAt: null })).toBe(jan);
  });

  it("conversa já encerrada: desde o último encerramento", () => {
    expect(docsReceivedSince({ createdAt: jan, closedAt: set })).toBe(set);
  });

  it("closedAt anterior à criação (dado torto) não volta no tempo", () => {
    expect(docsReceivedSince({ createdAt: set, closedAt: jan })).toBe(set);
  });
});

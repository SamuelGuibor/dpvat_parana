import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Cache único de URLs de mídia do inbox (bolha da thread + Copiloto). A URL
// vem assinada do servidor numa janela estável; a server action é só o
// fallback. O que não pode quebrar: a entrada válida vence a semente nova (a
// imagem não troca de src a cada virada de janela), a chave separa o nome do
// Content-Disposition, e pedidos simultâneos dividem a mesma action.

const mocks = vi.hoisted(() => ({ downloadFileFromS3: vi.fn() }));
vi.mock("@/app/_actions/documents/download-s3", () => ({ downloadFileFromS3: mocks.downloadFileFromS3 }));

import { getMediaUrl, seedMediaUrl } from "@/app/nova-dash/workspace/whatsapp/media-url-cache";

const NOW = Date.UTC(2026, 8, 25, 15, 0, 0);
const inMin = (min: number) => new Date(NOW + min * 60_000).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mocks.downloadFileFromS3.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("seedMediaUrl", () => {
  it("guarda a semente e a entrada válida vence a semente seguinte", () => {
    expect(seedMediaUrl("whatsapp/c1/1-a.jpg", "https://s3/a?v=1", inMin(90))).toBe("https://s3/a?v=1");
    // Janela virou: o servidor manda outra URL, mas a mídia não troca de src.
    expect(seedMediaUrl("whatsapp/c1/1-a.jpg", "https://s3/a?v=2", inMin(120))).toBe("https://s3/a?v=1");
  });

  it("semente vencida (ou dentro da margem de 5 min) não é usada", () => {
    expect(seedMediaUrl("whatsapp/c2/1-b.jpg", "https://s3/b", inMin(4))).toBeNull();
    expect(seedMediaUrl("whatsapp/c2/1-b.jpg", "https://s3/b", inMin(-1))).toBeNull();
    expect(seedMediaUrl("whatsapp/c2/1-b.jpg", null, null)).toBeNull();
    expect(seedMediaUrl("whatsapp/c2/1-b.jpg", "https://s3/b", "data inválida")).toBeNull();
  });

  it("entrada vencida sai do cache e a semente nova entra", () => {
    seedMediaUrl("whatsapp/c3/1-c.jpg", "https://s3/c?v=1", inMin(30));
    vi.setSystemTime(NOW + 26 * 60_000); // passou de expiresAt − 5 min
    expect(seedMediaUrl("whatsapp/c3/1-c.jpg", "https://s3/c?v=2", inMin(120))).toBe("https://s3/c?v=2");
  });

  it("nome e modo fazem parte da chave (Content-Disposition diferente)", () => {
    seedMediaUrl("whatsapp/c4/1-d.pdf", "https://s3/d-msg", inMin(90));
    expect(seedMediaUrl("whatsapp/c4/1-d.pdf", "https://s3/d-doc", inMin(90), { fileName: "RG.pdf" })).toBe(
      "https://s3/d-doc",
    );
    expect(seedMediaUrl("whatsapp/c4/1-d.pdf", "https://s3/d-dl", inMin(90), { inline: false })).toBe(
      "https://s3/d-dl",
    );
    // A da bolha continua lá.
    expect(seedMediaUrl("whatsapp/c4/1-d.pdf", "https://s3/outra", inMin(90))).toBe("https://s3/d-msg");
  });
});

describe("getMediaUrl (fallback pela action)", () => {
  it("com entrada válida não chama a action", async () => {
    seedMediaUrl("whatsapp/c5/1-e.jpg", "https://s3/e", inMin(90));
    await expect(getMediaUrl("whatsapp/c5/1-e.jpg")).resolves.toBe("https://s3/e");
    expect(mocks.downloadFileFromS3).not.toHaveBeenCalled();
  });

  it("sem entrada chama a action UMA vez para pedidos simultâneos, com nome e modo", async () => {
    mocks.downloadFileFromS3.mockResolvedValue({ success: true, presignedUrl: "https://s3/f" });
    const [a, b] = await Promise.all([
      getMediaUrl("whatsapp/c6/1720000000000-foto.jpg"),
      getMediaUrl("whatsapp/c6/1720000000000-foto.jpg"),
    ]);
    expect(a).toBe("https://s3/f");
    expect(b).toBe("https://s3/f");
    expect(mocks.downloadFileFromS3).toHaveBeenCalledTimes(1);
    expect(mocks.downloadFileFromS3).toHaveBeenCalledWith("whatsapp/c6/1720000000000-foto.jpg", "foto.jpg", true);
    // A URL da action fica no cache (e vence semente posterior).
    expect(seedMediaUrl("whatsapp/c6/1720000000000-foto.jpg", "https://s3/g", inMin(90))).toBe("https://s3/f");
  });

  it("falha da action devolve null e não fica em cache", async () => {
    mocks.downloadFileFromS3.mockResolvedValueOnce({ success: false, error: "x" });
    await expect(getMediaUrl("whatsapp/c7/1-h.jpg")).resolves.toBeNull();
    mocks.downloadFileFromS3.mockRejectedValueOnce(new Error("rede"));
    await expect(getMediaUrl("whatsapp/c7/1-h.jpg")).resolves.toBeNull();
    mocks.downloadFileFromS3.mockResolvedValueOnce({ success: true, presignedUrl: "https://s3/h" });
    await expect(getMediaUrl("whatsapp/c7/1-h.jpg")).resolves.toBe("https://s3/h");
    expect(mocks.downloadFileFromS3).toHaveBeenCalledTimes(3);
  });
});

import { describe, it, expect, vi, afterEach } from "vitest";
import { convertDocxToPdf } from "@/app/_shared/lib/docs/converter";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
vi.spyOn(console, "warn").mockImplementation(() => {});
afterEach(() => fetchMock.mockReset());

const res = (status: number, body = "x") => new Response(body, { status });

describe("convertDocxToPdf", () => {
  it("500 esporádico: tenta de novo e devolve o PDF", async () => {
    fetchMock.mockResolvedValueOnce(res(500)).mockResolvedValueOnce(res(200, "%PDF"));
    const pdf = await convertDocxToPdf(Buffer.from("docx"));
    expect(pdf.toString()).toBe("%PDF");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("422 (LibreOffice não abriu): não repete, modelo_invalido", async () => {
    fetchMock.mockResolvedValue(res(422, "bad"));
    await expect(convertDocxToPdf(Buffer.from("docx"))).rejects.toMatchObject({ code: "modelo_invalido" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fora do ar nas 2 tentativas: conversor_indisponivel", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(convertDocxToPdf(Buffer.from("docx"))).rejects.toMatchObject({ code: "conversor_indisponivel" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sem orçamento não chama", async () => {
    await expect(convertDocxToPdf(Buffer.from("docx"), { budgetMs: 1000 })).rejects.toMatchObject({ code: "conversor_indisponivel" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

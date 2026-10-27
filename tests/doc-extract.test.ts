import { describe, it, expect } from "vitest";
import { compareWithCard, consolidate, normalizeDateBR, parseExtracted, sameValue } from "@/app/_shared/utils/doc-extract";

const rg = { arquivo: "rg.jpg", tipo: "RG", legivel: true, nome: "ANA MARIA SOUZA", cpf: "529.982.247-25", rg: "12.345.678-9", data_nascimento: "01/05/1990", nome_mae: "MARIA SOUZA" };
const comprovante = {
  arquivo: "luz.pdf",
  tipo: "comprovante_endereco",
  legivel: true,
  nome: "Ana M. Souza",
  endereco: { rua: "Rua A", numero: "10", bairro: "Centro", cidade: "Curitiba", estado: "pr", cep: "80.000-000" },
};

describe("parseExtracted", () => {
  it("aceita objeto com documentos ou lista; tipo fora da lista vira outro; 'null' vira null", () => {
    const docs = parseExtracted({ documentos: [{ arquivo: "x.pdf", tipo: "Carteira", nome: "null", legivel: "sim" }] });
    expect(docs).toEqual([expect.objectContaining({ arquivo: "x.pdf", tipo: "outro", nome: null, legivel: true })]);
    expect(parseExtracted(null)).toEqual([]);
    expect(parseExtracted([{ arquivo: "a", tipo: "cnh", legivel: false }])[0]).toMatchObject({ tipo: "CNH", legivel: false });
  });
});

describe("consolidate", () => {
  it("identidade vem do RG/CNH, endereço do comprovante; CPF só válido e só dígitos; UF maiúscula; CEP 8 dígitos", () => {
    const c = consolidate(parseExtracted([comprovante, rg]));
    expect(c.valores).toMatchObject({ name: "ANA MARIA SOUZA", cpf: "52998224725", rg: "12.345.678-9", data_nasc: "01/05/1990", rua: "Rua A", estado: "PR", cep: "80000000" });
    expect(c.fontes.name).toBe("rg.jpg");
    expect(c.fontes.rua).toBe("luz.pdf");
    const invalido = consolidate(parseExtracted([{ ...rg, cpf: "111.111.111-12" }]));
    expect(invalido.valores.cpf).toBeUndefined();
  });
  it("documento ilegível não fornece valor", () => {
    expect(consolidate(parseExtracted([{ ...rg, legivel: false }])).valores).toEqual({});
  });
});

describe("compareWithCard", () => {
  it("vazio → preencher; diferente → trocar + divergência; igual (acento/máscara/data) → iguais", () => {
    const c = consolidate(parseExtracted([rg, comprovante]));
    const r = compareWithCard(c, { name: "Ana Maria Souza", cpf: "52998224752", rg: null, data_nasc: "1990-05-01", cidade: "curitiba" });
    expect(r.iguais).toEqual(expect.arrayContaining(["name", "data_nasc", "cidade"]));
    expect(r.preencher).toMatchObject({ rg: "12.345.678-9", rua: "Rua A" });
    expect(r.trocar).toEqual({ cpf: "52998224725" });
    expect(r.divergencias).toEqual([{ campo: "cpf", rotulo: "CPF", noDocumento: "52998224725", noCard: "52998224752", fonte: "rg.jpg" }]);
    expect(r.sugestoes).toMatchObject({ cpf: "52998224725", rg: "12.345.678-9" });
  });
  it("datas e dígitos", () => {
    expect(normalizeDateBR("1990-05-01")).toBe("01/05/1990");
    expect(normalizeDateBR("1/5/90")).toBe("01/05/1990");
    expect(normalizeDateBR("05/2020")).toBe("05/2020");
    expect(sameValue("cpf", "529.982.247-25", "52998224725")).toBe(true);
    expect(sameValue("rg", "", "")).toBe(false);
    expect(sameValue("name", "José da Silva", "jose  da silva")).toBe(true);
  });
});

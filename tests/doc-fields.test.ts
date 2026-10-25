import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import {
  buildProcuracaoData,
  classifyTemplate,
  draftFileName,
  isOpDraftExpired,
  matchTemplate,
  missingFields,
  opDraftKey,
  parseOpDraftKey,
  templateFields,
} from "@/app/_shared/utils/doc-fields";

/** .docx mínimo com o corpo dado (runs `<w:r>` já montados). */
function docx(bodyXml: string): Buffer {
  const zip = new PizZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${bodyXml}</w:body></w:document>`,
  );
  return zip.generate({ type: "nodebuffer" });
}
const p = (...runs: string[]) => `<w:p>${runs.map((t) => `<w:r><w:t xml:space="preserve">${t}</w:t></w:r>`).join("")}</w:p>`;

describe("templateFields", () => {
  it("tags simples, na ordem, sem repetir", () => {
    expect(templateFields(docx(p("Eu, [[name]], CPF [[cpf]]") + p("de novo [[name]]")))).toEqual(["name", "cpf"]);
  });

  it("tag partida entre runs (o Word faz isso) é achada", () => {
    expect(templateFields(docx(p("RG: [[", "r", "g]] e ", "[[estado_", "civil]]")))).toEqual(["rg", "estado_civil"]);
  });

  it("modelo sem tag → lista vazia", () => {
    expect(templateFields(docx(p("texto fixo")))).toEqual([]);
  });

  it("modelos do repositório usam só campos que o CRM tem", () => {
    const dados = buildProcuracaoData({}, "01/01/2026");
    const dir = path.join(process.cwd(), "templates");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".docx"));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const tags = templateFields(fs.readFileSync(path.join(dir, f)));
      expect(tags.length).toBeGreaterThan(0);
      expect(missingFields(tags, dados).filter((m) => m.desconhecido)).toEqual([]);
    }
    expect(templateFields(fs.readFileSync(path.join(dir, "PEDIDO_HOSPITALAR.docx")))).toEqual(
      expect.arrayContaining(["hospital", "data_acidente", "nome_mae", "data_nascimento"]),
    );
  });
});

describe("buildProcuracaoData", () => {
  it("mesmo mapa do gerarProcuracaoById antigo (padrões e renomeação data_nasc → data_nascimento)", () => {
    const card = {
      name: "Ana Souza", cpf: "12345678909", rg: null, nacionalidade: null, estado_civil: "casada", profissao: "",
      rua: "Rua A", bairro: "Centro", numero: "10", cep: "80000-000", cidade: "Curitiba", estado: "PR",
      data_nasc: "01/02/1990", hospital: "Hospital X", nome_mae: "Maria", data_acidente: "03/04/2026",
    };
    // Cópia literal do bloco antigo de gerarProcuracaoById (antes da extração).
    const antigo = {
      name: card.name || "", cpf: card.cpf || "", rg: card.rg || "", nacionalidade: card.nacionalidade || "brasileiro(a)",
      estado_civil: card.estado_civil || "", profissao: card.profissao || "", rua: card.rua || "", bairro: card.bairro || "",
      numero: card.numero || "", cep: card.cep || "", cidade: card.cidade || "", estado: card.estado || "",
      data_nascimento: card.data_nasc || "", hospital: card.hospital || "", nome_mae: card.nome_mae || "",
      data_acidente: card.data_acidente || "", data: "25/10/2026",
    };
    expect(buildProcuracaoData(card, "25/10/2026")).toEqual(antigo);
  });
});

describe("missingFields", () => {
  const dados = buildProcuracaoData({ name: "Ana", cpf: "1", rg: "  " }, "25/10/2026");
  it("vazio e só-espaço faltam; nacionalidade e data nunca faltam", () => {
    const m = missingFields(["name", "cpf", "rg", "nacionalidade", "data", "estado_civil"], dados);
    expect(m.map((x) => x.campo)).toEqual(["rg", "estado_civil"]);
    expect(m[1]).toEqual({ campo: "estado_civil", rotulo: "estado civil", desconhecido: false });
  });
  it("tag que o CRM não tem é faltante desconhecida (sairia undefined)", () => {
    expect(missingFields(["cnpj"], dados)).toEqual([{ campo: "cnpj", rotulo: "cnpj", desconhecido: true }]);
  });
});

describe("classifyTemplate / matchTemplate", () => {
  it("tipo pelo nome", () => {
    expect(classifyTemplate("PEDIDO_HOSPITALAR.docx")).toBe("pedido_prontuario");
    expect(classifyTemplate("KIT DRA EVELYN INSS.docx")).toBe("contrato");
    expect(classifyTemplate("KIT_PREV_CSS.docx")).toBe("contrato");
    expect(classifyTemplate("-PROCURAÇÃO-ESPECÍFICA_CURITIBA.docx")).toBe("procuracao");
    expect(classifyTemplate("DECLARACAO_DE_HIPOSSUFICIENCIA.docx")).toBe("procuracao");
    expect(classifyTemplate("Solicitação de prontuário")).toBe("pedido_prontuario");
  });

  const ts = [
    { filename: "-PROCURAÇÃO-ESPECÍFICA_CURITIBA.docx", label: "-PROCURAÇÃO-ESPECÍFICA_CURITIBA" },
    { filename: "-PROCURAÇÃO-ESPECÍFICA-TAYNARA.docx", label: "Procuração Taynara" },
  ];
  it("exato por arquivo, sem .docx ou por rótulo (sem acento/caixa)", () => {
    expect(matchTemplate(ts, "-procuracao-especifica_curitiba.docx").exact?.label).toBe("-PROCURAÇÃO-ESPECÍFICA_CURITIBA");
    expect(matchTemplate(ts, "procuração taynara").exact?.filename).toBe("-PROCURAÇÃO-ESPECÍFICA-TAYNARA.docx");
  });
  it("parcial nunca escolhe: devolve candidatas", () => {
    const r = matchTemplate(ts, "procuracao");
    expect(r.exact).toBeNull();
    expect(r.candidates).toHaveLength(2);
    expect(matchTemplate(ts, "xyz")).toEqual({ exact: null, candidates: [] });
  });
});

describe("key do rascunho", () => {
  it("ida e volta; formato fora do padrão ou traversal → null", () => {
    const key = opDraftKey("clabc123xyz", 1761350400000, "0a1b2c3d");
    expect(key).toBe("op-drafts/clabc123xyz/1761350400000-0a1b2c3d.pdf");
    expect(parseOpDraftKey(key)).toEqual({ cardId: "clabc123xyz", ts: 1761350400000 });
    expect(parseOpDraftKey("uploads/user_x/1761350400000-0a1b2c3d.pdf")).toBeNull();
    expect(parseOpDraftKey("op-drafts/../uploads/1761350400000-0a1b2c3d.pdf")).toBeNull();
    expect(parseOpDraftKey("op-drafts/clabc123xyz/1761350400000-0a1b2c3d.pdf.exe")).toBeNull();
  });
  it("vence em 7 dias", () => {
    const now = Date.UTC(2026, 9, 25);
    expect(isOpDraftExpired(now - 6 * 86_400_000, now)).toBe(false);
    expect(isOpDraftExpired(now - 8 * 86_400_000, now)).toBe(true);
  });
  it("nome do PDF sem caracteres que quebram o download", () => {
    expect(draftFileName("-PROCURAÇÃO-ESPECÍFICA_CURITIBA", 'Ana "Souza"; x/y')).toBe("PROCURAÇÃO-ESPECÍFICA_CURITIBA - Ana Souza xy.pdf");
    expect(draftFileName("KIT", null)).toBe("KIT - cliente.pdf");
  });
});

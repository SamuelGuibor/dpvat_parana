import { describe, it, expect } from "vitest";
import {
  automationSourceText,
  checkNote,
  contactsNotIn,
  decideSeed,
  extractContacts,
  fonteAutomationIds,
  normalizeHospitalName,
  parseNote,
  renderNote,
  sampleOf,
  sections,
  slugify,
  sourceHash,
  wikilinks,
} from "@/app/_shared/utils/vault";

describe("nomes", () => {
  it("normaliza sem o prefixo [HOSPITAL] do GHOST, acento e pontuação", () => {
    expect(normalizeHospitalName("[HOSPITAL] Hosp. São José – Curitiba")).toBe("HOSP SAO JOSE CURITIBA");
    expect(normalizeHospitalName("Hosp. São José - Curitiba")).toBe("HOSP SAO JOSE CURITIBA");
    expect(normalizeHospitalName("  angelina   caron ")).toBe("ANGELINA CARON");
  });
  it("slug estável", () => {
    expect(slugify("Hospital Angelina Caron")).toBe("hospital-angelina-caron");
    expect(slugify("[HOSPITAL] UPA (Pato Branco)")).toBe("upa-pato-branco");
    expect(slugify("")).toBe("sem-nome");
  });
});

describe("fonte e hash", () => {
  const a = {
    id: "b1",
    actions: [
      { type: "comment", templateText: "Pedir por e-mail\r\nprontuario@hosp.com.br " },
      { type: "file", templateFileName: "Formulário.pdf" },
      { type: "whatsapp", waText: "ignorado" },
    ],
  };
  it("texto da fonte = comentário literal + anexos", () => {
    expect(automationSourceText(a)).toBe("Pedir por e-mail\nprontuario@hosp.com.br\n\n[anexo] Formulário.pdf");
  });
  it("hash não depende da ordem das automações e muda com o texto", () => {
    const b = { id: "a0", actions: [{ type: "comment", templateText: "outro" }] };
    expect(sourceHash([a, b])).toBe(sourceHash([b, a]));
    expect(sourceHash([a])).toMatch(/^[0-9a-f]{64}$/);
    const a2 = { ...a, actions: [{ type: "comment", templateText: "Pedir por WhatsApp" }] };
    expect(sourceHash([a2])).not.toBe(sourceHash([a]));
  });
  it("ids de automação da fonte", () => {
    expect(fonteAutomationIds("automation:x1, automation:y2")).toEqual(["x1", "y2"]);
    expect(fonteAutomationIds("pessoa:Samuel")).toEqual([]);
  });
});

describe("contatos", () => {
  const txt = `Enviar para prontuario@hospital.org.br. Tel (41) 3333-4444 ou 41 99876-5432.
Site: https://hospital.org.br/prontuario. 0800 123 4567. CEP 80250-060, protocolo 2024/123456789, data 12/03/2025.`;
  it("extrai e-mail, telefones e link sem pegar CEP/protocolo/data", () => {
    const c = extractContacts(txt);
    expect(c.email).toEqual(["prontuario@hospital.org.br"]);
    expect(c.site).toEqual(["https://hospital.org.br/prontuario"]);
    expect(c.telefone).toEqual(["(41) 3333-4444", "41 99876-5432", "0800 123 4567"]);
  });
  it("contato inventado é acusado; formato diferente do mesmo número não", () => {
    const fonte = extractContacts(txt);
    expect(contactsNotIn({ email: ["PRONTUARIO@hospital.org.br"], telefone: ["41 3333-4444"], site: ["hospital.org.br"] }, fonte)).toEqual([]);
    expect(contactsNotIn({ email: ["sac@hospital.org.br"], telefone: ["(41) 3333-9999"], site: ["https://outro.com"] }, fonte)).toEqual([
      "sac@hospital.org.br",
      "(41) 3333-9999",
      "https://outro.com",
    ]);
  });
  it("quebra de linha escapada não gruda no contato; hífen com espaços vale", () => {
    const c = extractContacts(String.raw`retire em https://x.gov.br/atendimento\n(11) 4143-8499 e-mail:\nhsfa.protocolos@gmail.com fixo (43) 3174 - 3100`);
    expect(c.site).toEqual(["https://x.gov.br/atendimento"]);
    expect(c.email).toEqual(["hsfa.protocolos@gmail.com"]);
    expect(c.telefone).toEqual(["(11) 4143-8499", "(43) 3174 - 3100"]);
  });
});

describe("frontmatter", () => {
  const fm = {
    kind: "extraido_do_codigo",
    status: "rascunho",
    fonte: "automation:abc",
    fonte_hash: "a".repeat(64),
    hospital: "Hospital São José: Curitiba",
    modo: ["email"],
    contatos: { email: ["x@y.com"], telefone: [], site: [] },
    redigido_por: null,
    atualizado_em: "2026-10-24",
    pendente_humano: [],
  };
  it("ida e volta", () => {
    const text = renderNote(fm, "\n## Fonte\n\ntexto\n");
    const p = parseNote(text);
    expect(p.errors).toEqual([]);
    expect(p.fm).toEqual(fm);
    expect(sections(p.body)).toEqual({ Fonte: "texto" });
  });
  it("sem frontmatter = erro", () => {
    expect(parseNote("# nada").errors.length).toBe(1);
  });
});

describe("decisão do seed", () => {
  const h = "b".repeat(64);
  it("nunca reescreve trabalho redigido", () => {
    expect(decideSeed(null, h)).toBe("criar");
    expect(decideSeed({ fonte_hash: h, status: "publicado" }, h)).toBe("pular");
    expect(decideSeed({ fonte_hash: "x", status: "rascunho" }, h)).toBe("atualizar");
    expect(decideSeed({ fonte_hash: "x", status: "rascunho", redigido_por: "agente-redator" }, h)).toBe("desatualizar");
    expect(decideSeed({ fonte_hash: "x", status: "em_validacao", redigido_por: "agente-redator" }, h)).toBe("desatualizar");
    expect(decideSeed({ fonte_hash: "x", status: "publicado" }, h)).toBe("desatualizar");
    expect(decideSeed({ fonte_hash: "x", status: "desatualizado" }, h)).toBe("pular");
    expect(decideSeed({ kind: "oficial", fonte: "pessoa:Samuel", status: "publicado" }, h)).toBe("pular");
  });
});

describe("checkNote", () => {
  const base = {
    kind: "extraido_do_codigo",
    status: "publicado",
    fonte: "automation:abc",
    fonte_hash: "c".repeat(64),
    hospital: "Hospital X",
    modo: ["email"],
    contatos: { email: ["p@x.com"], telefone: [], site: [] },
    redigido_por: "agente-redator",
    validado_por: "agente-validador",
    publicado_por: "agente-validador",
    atualizado_em: "2026-10-24",
    pendente_humano: [],
  };
  const body = (extra = "") =>
    `\n## Como pedir\n1. E-mail para p@x.com${extra}\n\n## Contato\np@x.com\n\n## Documentos e procuração\n—\n\n## Prazo e retorno\n—\n\n## Observações\n—\n\n## Fonte\n\`\`\`\`text\nmandar para p@x.com\n\`\`\`\`\n`;

  it("nota publicada correta passa", () => {
    expect(checkNote("hospitais/x.md", renderNote(base, body()))).toEqual([]);
  });
  it("contato inventado no corpo reprova", () => {
    expect(checkNote("hospitais/x.md", renderNote(base, body(" ou sac@x.com")))).toContain("contato no corpo que não está na Fonte: sac@x.com");
  });
  it("publicado exige validador e pendente_humano vazio", () => {
    const errs = checkNote("hospitais/x.md", renderNote({ ...base, validado_por: null, pendente_humano: ["confirmar"] }, body()));
    expect(errs).toContain("publicado sem validado_por");
    expect(errs).toContain("publicado com pendente_humano não vazio");
  });
  it("rascunho do seed (só Fonte) passa", () => {
    const fm = { ...base, status: "rascunho", redigido_por: null, validado_por: null, publicado_por: null, modo: null };
    expect(checkNote("hospitais/x.md", renderNote(fm, "\n## Fonte\n```text\np@x.com\n```\n"))).toEqual([]);
  });
  it("valores inválidos", () => {
    const errs = checkNote("etapas/y.md", renderNote({ ...base, kind: "chute", status: "ok", atualizado_em: "24/10" }, "x"));
    expect(errs.some((e) => e.startsWith("kind inválido"))).toBe(true);
    expect(errs.some((e) => e.startsWith("status inválido"))).toBe(true);
    expect(errs).toContain("atualizado_em deve ser AAAA-MM-DD");
  });
});

describe("utilitários", () => {
  it("wikilinks", () => {
    expect(wikilinks("ver [[hospitais/a]] e [[etapas/b|B]] e [[c#sec]]")).toEqual(["hospitais/a", "etapas/b", "c"]);
  });
  it("amostra determinística de 10% (mín. 1)", () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const s = sampleOf(items, 0.1, "lote-1");
    expect(s).toHaveLength(3);
    expect(sampleOf(items, 0.1, "lote-1")).toEqual(s);
    expect(sampleOf([1], 0.1, "x")).toEqual([1]);
    expect(sampleOf([], 0.1, "x")).toEqual([]);
  });
});

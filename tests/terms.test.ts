import { describe, it, expect } from "vitest";
import {
  parseTermsReply, formatVerificationCode, normalizeVerificationCode, canonicalTermsRecord,
  brDateTimeLabel, maskCpf, maskName, maskPhone, formatCpf, termsGate, normalizeColumnName,
  type TermsGateInput,
} from "@/app/_shared/utils/terms";

describe("resposta do formulário de aceite", () => {
  it("lê o payload do Flow aceite_termos_servico", () => {
    const r = parseTermsReply(JSON.stringify({
      flow_token: "crm.x", nome_completo: " Maria  da Silva ", cpf: "123.456.789-09",
      aceite_termos: true, consentimento_dados_saude: true, versao_termos: "v1",
    }));
    expect(r).toEqual({ accepted: true, termsVersion: "v1", name: "Maria da Silva", cpf: "12345678909", healthConsent: true });
  });

  it("outro formulário (sem aceite_termos) não é aceite; versão ausente = v1", () => {
    expect(parseTermsReply({ cpf: "1" })).toBeNull();
    expect(parseTermsReply("{x")).toBeNull();
    expect(parseTermsReply({ aceite_termos: false })).toMatchObject({ accepted: false, termsVersion: "v1" });
  });
});

describe("código e registro", () => {
  it("código legível, sem caracteres ambíguos, e volta normalizado", () => {
    const code = formatVerificationCode(new Uint8Array(12).map((_, i) => i * 37));
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(normalizeVerificationCode(code.toLowerCase().replace(/-/g, " "))).toBe(code);
    expect(normalizeVerificationCode("0000-1111-OOOO")).toBeNull();
  });

  it("registro canônico estável (mesma entrada → mesma string)", () => {
    const base = {
      documentId: "d", code: "C", phone: "5541999999999", waMessageId: "wamid.1",
      acceptedAt: new Date("2026-11-13T13:42:05Z"), termsVersion: "v1", formName: "aceite", metaFlowId: "1",
      name: "Maria", cpf: "1", termsTextHash: null,
    };
    expect(canonicalTermsRecord(base)).toBe(canonicalTermsRecord({ ...base }));
    expect(canonicalTermsRecord(base)).toContain('"acceptedAt":"2026-11-13T13:42:05.000Z"');
  });

  it("data e hora de Brasília e máscaras", () => {
    expect(brDateTimeLabel(new Date("2026-11-13T13:42:05Z"))).toBe("13/11/2026 10:42:05");
    expect(maskCpf("12345678909")).toBe("***.456.789-**");
    expect(maskName("Maria da Silva")).toBe("Maria d. S.");
    expect(maskPhone("5541999998888")).toBe("*********8888");
    expect(formatCpf("12345678909")).toBe("123.456.789-09");
  });
});

describe("trava aceite × ZapSign do kanban", () => {
  // Ordem real do board em 13/11/2026.
  const col = (name: string, order: number) => ({ name, order });
  const FILTRO = col("Filtro de Cartões", 0);
  const COLHER = col("COLHER-ASSINATURA", 1);
  const TESTE = col("TESTE AUTOMAÇÃO", 2);
  const PROTOCOLO = col("FAZER PROTOCOLO DE SOLICITAÇÃO HOSPITAL", 3);
  const POUPA = col("POUPA TEMPO", 8);
  const PERICIA = col("AGENDAR PERÍCIA ADM", 9);
  const DISTRIB = col("DISTRIBUIÇÃO DE PROCESSOS", 13);
  const CONFERENCIA = col("CONFERENCIA DE DOCUMENTOS", 14);
  const gate = (from: { name: string; order: number }, to: { name: string; order: number }, hasAcceptance: boolean, hasZapsignTag: boolean) =>
    termsGate({ from, to, signatureFromOrder: 13, hasAcceptance, hasZapsignTag } satisfies TermsGateInput);

  it("nome da coluna comparável", () => {
    expect(normalizeColumnName("  Distribuição  de processos ")).toBe("DISTRIBUICAO DE PROCESSOS");
  });

  it("sair de COLHER-ASSINATURA exige aceite ou a tag", () => {
    expect(gate(COLHER, POUPA, false, false)).toMatchObject({ ok: false, code: "falta_aceite" });
    expect(gate(COLHER, POUPA, true, false)).toEqual({ ok: true });
    expect(gate(FILTRO, PROTOCOLO, false, true)).toEqual({ ok: true });
    expect(gate(COLHER, PERICIA, true, false)).toEqual({ ok: true }); // perícia fica antes da DISTRIBUIÇÃO
  });

  it("pular direto para a zona da assinatura exige a tag, mesmo com aceite", () => {
    expect(gate(COLHER, DISTRIB, true, false)).toMatchObject({ ok: false, code: "falta_zapsign" });
    expect(gate(COLHER, CONFERENCIA, true, true)).toEqual({ ok: true });
  });

  it("card que avançou pelo aceite precisa da tag para entrar na DISTRIBUIÇÃO", () => {
    expect(gate(POUPA, DISTRIB, true, false)).toMatchObject({ ok: false, code: "falta_zapsign" });
    expect(gate(POUPA, DISTRIB, true, true)).toEqual({ ok: true });
  });

  it("card antigo (sem aceite) já adiante segue livre; dentro da zona e para trás também", () => {
    expect(gate(POUPA, DISTRIB, false, false)).toEqual({ ok: true });
    expect(gate(DISTRIB, CONFERENCIA, true, false)).toEqual({ ok: true });
    expect(gate(POUPA, COLHER, false, false)).toEqual({ ok: true });
    expect(gate(FILTRO, COLHER, false, false)).toEqual({ ok: true });
  });

  it("coluna de teste não trava e sem a coluna de corte só vale a 1ª regra", () => {
    expect(gate(COLHER, TESTE, false, false)).toEqual({ ok: true });
    expect(termsGate({ from: POUPA, to: DISTRIB, signatureFromOrder: null, hasAcceptance: true, hasZapsignTag: false })).toEqual({ ok: true });
  });
});

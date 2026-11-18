import { describe, it, expect } from "vitest";
import {
  parseTermsReply, formatVerificationCode, normalizeVerificationCode, canonicalTermsRecord,
  brDateTimeLabel, maskCpf, maskName, maskPhone, formatCpf, termsGate, normalizeColumnName,
  termsAskStep, termsPendingSince, TERMS_MAX_SENDS, TERMS_RESEND_MS, TERMS_PENDING_CARRY_MS,
  type TermsGateInput,
} from "@/app/_shared/utils/terms";

// T-TC5IR (17/11): o formulário saía no qualify antes do RG/CNH.
describe("pedido do aceite pelo bot (termsAskStep)", () => {
  const now = Date.parse("2026-11-17T22:30:00Z");
  const ago = (min: number) => new Date(now - min * 60_000);

  const base = { sends: [] as Date[], sentEarlier: false, now };

  it("sem documento com foto neste atendimento, o 1º formulário não sai", () => {
    expect(termsAskStep({ ...base, docsReceived: 0 })).toBe("no_document");
  });

  it("com documento, o 1º formulário sai", () => {
    expect(termsAskStep({ ...base, docsReceived: 1 })).toBe("send");
    expect(termsAskStep({ ...base, docsReceived: 3 })).toBe("send");
  });

  it("formulário já enviado neste atendimento segue a regra de reenvio, com ou sem documento", () => {
    // Recente: espera (o cérebro lembra o botão).
    expect(termsAskStep({ ...base, sends: [ago(2)], docsReceived: 0 })).toBe("waiting");
    expect(termsAskStep({ ...base, sends: [ago(2)], docsReceived: 2 })).toBe("waiting");
    // Passou do intervalo: reenvia, mesmo sem documento (não vira "no_document").
    const old = new Date(now - TERMS_RESEND_MS - 1);
    expect(termsAskStep({ ...base, sends: [old], docsReceived: 0 })).toBe("send");
  });

  it("cliente que sumiu e voltou (formulário de atendimento anterior) recebe o reenvio sem documento", () => {
    expect(termsAskStep({ ...base, sentEarlier: true, docsReceived: 0 })).toBe("send");
  });

  it("no teto de envios, só espera", () => {
    const sends = Array.from({ length: TERMS_MAX_SENDS }, (_, i) => ago(60 * (i + 1)));
    expect(termsAskStep({ ...base, sends, docsReceived: 5 })).toBe("waiting");
  });
});

describe("janela do fato termsPending (termsPendingSince)", () => {
  const now = Date.parse("2026-11-18T13:00:00Z");

  it("encerramento recente (silêncio) não esconde o formulário de antes dele", () => {
    // Caso do Manuel: formulário às 12:02, sem_resposta às 14:15 do dia 17.
    const closedAt = new Date("2026-11-17T17:15:21Z");
    const since = termsPendingSince(closedAt, now);
    expect(since.getTime()).toBe(now - TERMS_PENDING_CARRY_MS);
    expect(since.getTime()).toBeLessThan(Date.parse("2026-11-17T15:02:05Z"));
  });

  it("atendimento longo continua valendo inteiro", () => {
    const createdAt = new Date(now - 20 * 86_400_000);
    expect(termsPendingSince(createdAt, now).getTime()).toBe(createdAt.getTime());
  });
});

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

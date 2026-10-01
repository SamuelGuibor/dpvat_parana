import { describe, expect, it } from "vitest";
import {
  CONTRACT_PENDING_WINDOW_MS,
  buildContractPending,
  extractZapSignLink,
  isSignatureColumn,
} from "@/app/_shared/utils/contract-pending";

// Fato contractPending (30/09/2026): o link da ZapSign que o ATENDENTE mandou,
// copiado da mensagem dele, para a IA reenviar o mesmo link e retomar a
// pendência da assinatura em vez de recomeçar a triagem.

const NOW = new Date("2026-10-01T15:00:00.000Z").getTime();
const LINK = "https://app.zapsign.com.br/verificar/doc/abc123-def456";

describe("extractZapSignLink", () => {
  it("tira o link da mensagem e a pontuação que cola no fim", () => {
    expect(extractZapSignLink(`Segue o contrato: ${LINK}.`)).toBe(LINK);
    expect(extractZapSignLink(`(${LINK})`)).toBe(LINK);
    expect(extractZapSignLink(`*${LINK}*`)).toBe(LINK);
  });

  it("sem link da ZapSign (ou outro domínio) dá null", () => {
    expect(extractZapSignLink("Vou te mandar o contrato pela ZapSign")).toBeNull();
    expect(extractZapSignLink("https://segurosparana.com.br/assinar/abc")).toBeNull();
    expect(extractZapSignLink(null)).toBeNull();
  });
});

describe("isSignatureColumn", () => {
  it("aceita as grafias da coluna COLHER-ASSINATURA", () => {
    expect(isSignatureColumn("COLHER-ASSINATURA")).toBe(true);
    expect(isSignatureColumn("Colher assinatura")).toBe(true);
    expect(isSignatureColumn("COLHER_ASSINATURA ")).toBe(true);
  });

  it("outras colunas e vazio não", () => {
    expect(isSignatureColumn("FALTA SENHA")).toBe(false);
    expect(isSignatureColumn("Assinatura colhida")).toBe(false);
    expect(isSignatureColumn(null)).toBe(false);
  });
});

describe("buildContractPending", () => {
  const message = { body: `Segue o link para assinar: ${LINK}`, createdAt: new Date(NOW - 2 * 24 * 60 * 60_000) };

  it("sem card ou com o card em COLHER-ASSINATURA: o fato leva o link exato", () => {
    expect(buildContractPending({ message, hasCard: false, cardColumn: null, now: NOW })).toEqual({
      link: LINK,
      sentAt: message.createdAt.toISOString(),
    });
    expect(buildContractPending({ message, hasCard: true, cardColumn: "COLHER-ASSINATURA", now: NOW })?.link).toBe(LINK);
  });

  it("card em outra coluna = o contrato já andou: sem fato", () => {
    expect(buildContractPending({ message, hasCard: true, cardColumn: "FALTA SENHA", now: NOW })).toBeNull();
  });

  it("link de mais de 10 dias ou mensagem sem link: sem fato", () => {
    const old = { ...message, createdAt: new Date(NOW - CONTRACT_PENDING_WINDOW_MS - 1) };
    expect(buildContractPending({ message: old, hasCard: false, cardColumn: null, now: NOW })).toBeNull();
    expect(buildContractPending({ message: { ...message, body: "assina lá" }, hasCard: false, cardColumn: null, now: NOW })).toBeNull();
    expect(buildContractPending({ message: null, hasCard: false, cardColumn: null, now: NOW })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  classifyLastMessage,
  isBotDecisionLog,
  isClosingAck,
  isEnvSwitchOn,
  isOrphanCandidate,
  orphanReason,
} from "@/app/_shared/utils/wa-silence";

// Cron de silêncio (whatsapp/cron-tasks.ts): a última mensagem decide se o bot
// cutuca, se a conversa só ganha o marcador de silêncio ou se é órfã (o
// cliente perguntou e o bot não decidiu nada) e vai para a Fila.

describe("isClosingAck", () => {
  it("agradecimento, emoji, reação e figurinha fecham o assunto", () => {
    expect(isClosingAck("ok obrigado", null)).toBe(true);
    expect(isClosingAck("Tá bom, obrigada!", null)).toBe(true);
    expect(isClosingAck("👍", null)).toBe(true);
    expect(isClosingAck("Reagiu com 👍", null)).toBe(true);
    expect(isClosingAck("👍 (reação)", null)).toBe(true);
    expect(isClosingAck("", "image/webp")).toBe(true);
    expect(isClosingAck(null, null)).toBe(true);
  });

  it("pergunta, frase longa e anexo com ou sem legenda são pendência", () => {
    expect(isClosingAck("Mas será no INSS essa perícia?", null)).toBe(false);
    expect(isClosingAck("ok obrigado mas e o valor do benefício", null)).toBe(false);
    expect(isClosingAck("", "image/jpeg")).toBe(false);
    expect(isClosingAck("legenda", "image/jpeg")).toBe(false);
    expect(isClosingAck("", "application/pdf")).toBe(false);
  });
});

describe("classifyLastMessage", () => {
  const base = { sentByBot: false, authorId: null, body: null, mediaType: null };

  it("sem mensagem visível → none", () => {
    expect(classifyLastMessage(null)).toBe("none");
  });

  it("saída do bot (inclui mensagem automática) → bot_asked", () => {
    expect(classifyLastMessage({ ...base, direction: "out", sentByBot: true, body: "Qual o seu nome?" }))
      .toBe("bot_asked");
  });

  it("saída de atendente → human_last, com ou sem autor registrado", () => {
    expect(classifyLastMessage({ ...base, direction: "out", authorId: "user-1", body: "Oi" })).toBe("human_last");
    expect(classifyLastMessage({ ...base, direction: "out", body: "enviada pelo celular" })).toBe("human_last");
  });

  it("cliente fechou o assunto → client_ack", () => {
    expect(classifyLastMessage({ ...base, direction: "in", body: "ok obrigado" })).toBe("client_ack");
    expect(classifyLastMessage({ ...base, direction: "in", body: "", mediaType: "image/webp" })).toBe("client_ack");
  });

  it("cliente perguntou ou mandou documento → client_pending", () => {
    expect(classifyLastMessage({ ...base, direction: "in", body: "Mas será no INSS essa perícia?" }))
      .toBe("client_pending");
    expect(classifyLastMessage({ ...base, direction: "in", body: "", mediaType: "image/jpeg" }))
      .toBe("client_pending");
  });
});

describe("isOrphanCandidate", () => {
  const ultima = new Date("2026-10-01T12:35:43Z");
  it("pendência e fecho do cliente entram na rede de órfã; bot, atendente e vazio não", () => {
    expect(isOrphanCandidate("client_pending", ultima, null)).toBe(true);
    expect(isOrphanCandidate("client_ack", ultima, null)).toBe(true);
    expect(isOrphanCandidate("bot_asked", ultima, null)).toBe(false);
    expect(isOrphanCandidate("human_last", ultima, null)).toBe(false);
    expect(isOrphanCandidate("none", ultima, null)).toBe(false);
  });

  it("fecho anterior ao Devolver não volta à Fila; pendência continua valendo", () => {
    const devolvida = new Date("2026-10-01T13:00:00Z");
    expect(isOrphanCandidate("client_ack", ultima, devolvida)).toBe(false);
    expect(isOrphanCandidate("client_pending", ultima, devolvida)).toBe(true);
    // Devolvida ANTES do "ok": o bot devia ter decidido sobre ele.
    expect(isOrphanCandidate("client_ack", ultima, new Date("2026-10-01T12:00:00Z"))).toBe(true);
  });
});

describe("isBotDecisionLog", () => {
  it("decisão normal do cérebro conta, inclusive o silêncio escolhido", () => {
    expect(isBotDecisionLog({ outcome: "continue", contactId: "c1" })).toBe(true);
    expect(isBotDecisionLog({ outcome: "qualify" })).toBe(true);
    expect(isBotDecisionLog({ outcome: "error", error: true, handoffSkipped: true })).toBe(true);
  });

  it("resposta descartada, erro adiado para a mensagem nova e handoff que falhou não contam", () => {
    expect(isBotDecisionLog({ outcome: "discarded_status" })).toBe(false);
    expect(isBotDecisionLog({ outcome: "discarded_newer" })).toBe(false);
    expect(isBotDecisionLog({ outcome: "error", deferredToNewer: true })).toBe(false);
    expect(isBotDecisionLog({ outcome: "error", handoffFailed: true })).toBe(false);
  });

  it("metadata ilegível conta como decisão (na dúvida, o cron segue como antes)", () => {
    expect(isBotDecisionLog(null)).toBe(true);
    expect(isBotDecisionLog("texto")).toBe(true);
    expect(isBotDecisionLog([1, 2])).toBe(true);
  });
});

describe("orphanReason", () => {
  it("diz há quanto tempo o cliente espera", () => {
    expect(orphanReason(35 * 60_000)).toBe("o bot não respondeu à última mensagem do cliente (35 min sem resposta)");
    expect(orphanReason(3 * 60 * 60_000)).toContain("(3 h sem resposta)");
    expect(orphanReason(3 * 24 * 60 * 60_000)).toContain("(3 dias sem resposta)");
    expect(orphanReason(-5_000)).toContain("(0 min sem resposta)");
  });
});

describe("isEnvSwitchOn", () => {
  it("ligado por padrão", () => {
    expect(isEnvSwitchOn(undefined)).toBe(true);
    expect(isEnvSwitchOn("")).toBe(true);
    expect(isEnvSwitchOn("1")).toBe(true);
    expect(isEnvSwitchOn("true")).toBe(true);
  });

  it("0/false/off/não desligam, sem diferenciar maiúsculas", () => {
    for (const v of ["0", "false", "FALSE", "off", "nao", "Não", "no", " 0 "]) {
      expect(isEnvSwitchOn(v)).toBe(false);
    }
  });
});

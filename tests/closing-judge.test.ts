import { describe, expect, it } from "vitest";
import { closingJudgeTranscript, parseClosingVerdict } from "@/app/_shared/utils/closing-judge";

// IA que julga fecho × retomada no SLA humano (closing-ai.ts): a transcrição
// precisa levar o horário de Brasília de cada mensagem, que é a pista
// principal ("bom dia" dois dias depois = retomada, caso José Roberto 01/10).

describe("closingJudgeTranscript", () => {
  it("cada linha leva data/hora de Brasília e quem falou", () => {
    expect(closingJudgeTranscript([
      { direction: "out", sentByBot: false, body: "Pode ficar tranquilo", mediaType: null, createdAt: new Date("2026-09-29T15:48:13Z") },
      { direction: "in", sentByBot: false, body: "entendi", mediaType: null, createdAt: new Date("2026-09-29T15:48:26Z") },
      { direction: "out", sentByBot: true, body: "Oi!", mediaType: null, createdAt: new Date("2026-09-30T13:00:00Z") },
      { direction: "in", sentByBot: false, body: "bom dia", mediaType: null, createdAt: new Date("2026-10-01T12:35:43Z") },
    ])).toBe(
      "[29/09 12:48] Atendente: Pode ficar tranquilo\n" +
      "[29/09 12:48] Cliente: entendi\n" +
      "[30/09 10:00] Bot: Oi!\n" +
      "[01/10 09:35] Cliente: bom dia",
    );
  });

  it("usa o texto já mascarado quando vem, e marca anexo sem texto", () => {
    const at = new Date("2026-10-01T12:00:00Z");
    expect(closingJudgeTranscript(
      [
        { direction: "in", sentByBot: false, body: "Senha123@", mediaType: null, createdAt: at },
        { direction: "in", sentByBot: false, body: null, mediaType: "image/jpeg", createdAt: at },
      ],
      ["[senha omitida]"],
    )).toBe("[01/10 09:00] Cliente: [senha omitida]\n[01/10 09:00] Cliente: [anexo: image/jpeg]");
  });
});

describe("parseClosingVerdict", () => {
  it("lê o JSON, mesmo com texto em volta", () => {
    expect(parseClosingVerdict('{"closing": true, "reason": "agradeceu"}')).toEqual({ closing: true, reason: "agradeceu" });
    expect(parseClosingVerdict('Resposta:\n{"closing": false, "reason": "retomou 2 dias depois"}')).toEqual({ closing: false, reason: "retomou 2 dias depois" });
  });

  it("formato inválido devolve null (quem chama avisa o atendente)", () => {
    expect(parseClosingVerdict("sim")).toBeNull();
    expect(parseClosingVerdict('{"closing": "talvez"}')).toBeNull();
    expect(parseClosingVerdict("{quebrado")).toBeNull();
  });
});

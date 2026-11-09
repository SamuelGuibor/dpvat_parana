import { describe, expect, it } from "vitest";
import {
  isOggOpus,
  isVoiceConfigured,
  isVoiceSystemSource,
  needsTextCompanion,
  parseVoiceRepliesDecision,
  toSpeechText,
  voiceSpeed,
} from "@/app/_shared/utils/voice-text";

describe("toSpeechText (o que a voz lê)", () => {
  it("tira marcação do WhatsApp, emoji e link", () => {
    expect(toSpeechText("Oi, *Maria*! 😊 Tudo _bem_?")).toBe("Oi, Maria! Tudo bem?");
    expect(toSpeechText("Acesse https://exemplo.com/x?y=1 para ver")).toBe("Acesse para ver.");
    expect(toSpeechText("👍")).toBe("");
  });

  it("lista vira frases com pausa", () => {
    const out = toSpeechText("Preciso de:\n- RG\n- Comprovante de endereço\n1. CNIS");
    expect(out).toBe("Preciso de: RG. Comprovante de endereço. CNIS.");
  });

  it("não duplica pontuação", () => {
    expect(toSpeechText("Certo!\nVamos lá.")).toBe("Certo! Vamos lá.");
  });
});

describe("needsTextCompanion (texto junto do áudio)", () => {
  it("link ou SAIR pedem o texto", () => {
    expect(needsTextCompanion("veja em https://site.com")).toBe(true);
    expect(needsTextCompanion("ou www.site.com.br")).toBe(true);
    expect(needsTextCompanion("é só responder SAIR, tá bom?")).toBe(true);
  });
  it("mensagem comum não pede", () => {
    expect(needsTextCompanion("Qual foi a data do acidente?")).toBe(false);
    expect(needsTextCompanion("vou sair agora")).toBe(false);
  });
});

describe("isVoiceConfigured", () => {
  const base = { ELEVENLABS_API_KEY: "k", ELEVENLABS_VOICE_ID: "v" };
  it("exige chave e voz", () => {
    expect(isVoiceConfigured(base)).toBe(true);
    expect(isVoiceConfigured({ ELEVENLABS_API_KEY: "k" })).toBe(false);
    expect(isVoiceConfigured({ ELEVENLABS_VOICE_ID: "v" })).toBe(false);
    expect(isVoiceConfigured({})).toBe(false);
  });
  it("interruptor WA_VOICE_REPLIES desliga", () => {
    expect(isVoiceConfigured({ ...base, WA_VOICE_REPLIES: "0" })).toBe(false);
    expect(isVoiceConfigured({ ...base, WA_VOICE_REPLIES: "false" })).toBe(false);
    expect(isVoiceConfigured({ ...base, WA_VOICE_REPLIES: "1" })).toBe(true);
  });
});

describe("origens e decisão do cérebro", () => {
  it("só automação, aviso de etapa e IA de operação viram áudio no envio de sistema", () => {
    for (const s of ["automation", "progress", "op"]) expect(isVoiceSystemSource(s)).toBe(true);
    for (const s of ["recovery", "collect_nudge", "client_followup", "signature_otp", null]) {
      expect(isVoiceSystemSource(s)).toBe(false);
    }
  });
  it("valor fora do enum vira manter", () => {
    expect(parseVoiceRepliesDecision("ligar")).toBe("ligar");
    expect(parseVoiceRepliesDecision("desligar")).toBe("desligar");
    expect(parseVoiceRepliesDecision(undefined)).toBe("manter");
    expect(parseVoiceRepliesDecision("sim")).toBe("manter");
  });
});

describe("voiceSpeed (velocidade da fala)", () => {
  it("padrão 1,1 sem env ou com lixo", () => {
    expect(voiceSpeed(undefined)).toBe(1.1);
    expect(voiceSpeed("")).toBe(1.1);
    expect(voiceSpeed("rapido")).toBe(1.1);
  });
  it("aceita ponto ou vírgula e corta na faixa da ElevenLabs", () => {
    expect(voiceSpeed("1.05")).toBe(1.05);
    expect(voiceSpeed("1,15")).toBe(1.15);
    expect(voiceSpeed("2")).toBe(1.2);
    expect(voiceSpeed("0.5")).toBe(0.7);
  });
});

describe("isOggOpus", () => {
  it("reconhece o cabeçalho OggS", () => {
    expect(isOggOpus(new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0, 2]))).toBe(true);
    expect(isOggOpus(new Uint8Array([0x49, 0x44, 0x33, 0x04, 0]))).toBe(false); // MP3 (ID3)
    expect(isOggOpus(new Uint8Array([]))).toBe(false);
  });
});

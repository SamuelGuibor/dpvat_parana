import { describe, expect, it } from "vitest";
import {
  ASSIST_OPS,
  ASSIST_URL,
  assistBody,
  assistIdField,
  assistUrl,
  describeAssistError,
  isAssistOp,
  readAssistTarget,
  readAssistText,
  readFichaResult,
} from "@/app/_shared/utils/assist-api";
import { HttpError } from "@/app/_shared/utils/fetch-json";

// Rota da IA do Copiloto (POST /api/whatsapp/assist/<op>): endereço, corpo só
// com o id, leitura do corpo no servidor e da resposta no navegador, e o texto
// do erro que o atendente vê (nunca o "Internal Server Error" cru).

describe("assistUrl / isAssistOp", () => {
  it("rota da equipe fora de /api/whatsapp/webhook, /cron e /brain-prompt (allowlists do middleware)", () => {
    expect(ASSIST_URL).toBe("/api/whatsapp/assist");
    expect(ASSIST_OPS.map(assistUrl)).toEqual([
      "/api/whatsapp/assist/summary",
      "/api/whatsapp/assist/suggest",
      "/api/whatsapp/assist/transcribe",
      "/api/whatsapp/assist/ficha",
    ]);
  });

  it("só as 4 ops existem", () => {
    for (const op of ASSIST_OPS) expect(isAssistOp(op)).toBe(true);
    expect(isAssistOp("summarize")).toBe(false);
    expect(isAssistOp("")).toBe(false);
    expect(isAssistOp(undefined)).toBe(false);
    expect(isAssistOp(["summary"])).toBe(false);
  });
});

describe("assistBody / readAssistTarget", () => {
  it("transcrição vai por messageId; o resto, por contactId", () => {
    expect(assistIdField("transcribe")).toBe("messageId");
    expect(assistBody("transcribe", "m1")).toEqual({ messageId: "m1" });
    expect(assistBody("summary", "c1")).toEqual({ contactId: "c1" });
    expect(assistBody("suggest", "c1")).toEqual({ contactId: "c1" });
    expect(assistBody("ficha", "c1")).toEqual({ contactId: "c1" });
  });

  it("ida e volta: o que o navegador manda é o que a rota lê", () => {
    for (const op of ASSIST_OPS) expect(readAssistTarget(op, assistBody(op, "abc123"))).toBe("abc123");
  });

  it("apara espaços e recusa id ausente, vazio, de outro campo, de outro tipo ou comprido demais", () => {
    expect(readAssistTarget("summary", { contactId: "  c1 " })).toBe("c1");
    expect(readAssistTarget("summary", { messageId: "c1" })).toBeNull();
    expect(readAssistTarget("transcribe", { contactId: "m1" })).toBeNull();
    expect(readAssistTarget("summary", { contactId: "   " })).toBeNull();
    expect(readAssistTarget("summary", { contactId: 123 })).toBeNull();
    expect(readAssistTarget("summary", { contactId: "x".repeat(65) })).toBeNull();
    expect(readAssistTarget("summary", { contactId: "x".repeat(64) })).toBe("x".repeat(64));
    expect(readAssistTarget("summary", null)).toBeNull();
    expect(readAssistTarget("summary", "c1")).toBeNull();
    expect(readAssistTarget("summary", ["c1"])).toBeNull();
  });
});

describe("readAssistText / readFichaResult", () => {
  it("devolve o texto da resposta", () => {
    expect(readAssistText({ text: "Resumo da conversa" })).toBe("Resumo da conversa");
  });

  it("formato errado LANÇA (proxy, deploy no meio) em vez de pôr lixo na tela", () => {
    expect(() => readAssistText({})).toThrow("Resposta inválida da IA");
    expect(() => readAssistText({ text: "  " })).toThrow("Resposta inválida da IA");
    expect(() => readAssistText({ text: 12 })).toThrow("Resposta inválida da IA");
    expect(() => readAssistText(null)).toThrow("Resposta inválida da IA");
    expect(() => readAssistText("texto")).toThrow("Resposta inválida da IA");
  });

  it("ficha: campos preenchidos, dica de hospital e motivo", () => {
    expect(readFichaResult({ filled: ["cpf", "name"] })).toEqual({ filled: ["cpf", "name"], hospitalHint: null, reason: undefined });
    expect(readFichaResult({ filled: [], hospitalHint: "Hospital Cajuru", reason: "Nenhum campo novo" })).toEqual({
      filled: [],
      hospitalHint: "Hospital Cajuru",
      reason: "Nenhum campo novo",
    });
    expect(readFichaResult({ filled: ["cpf", 3, null], hospitalHint: "  " })).toEqual({
      filled: ["cpf"],
      hospitalHint: null,
      reason: undefined,
    });
  });

  it("ficha fora do formato LANÇA", () => {
    expect(() => readFichaResult({ reason: "x" })).toThrow("Resposta inválida da IA");
    expect(() => readFichaResult(null)).toThrow("Resposta inválida da IA");
  });
});

describe("describeAssistError", () => {
  const fallback = "Falha ao gerar o resumo.";

  it("mensagem da rota vence (timeout, micro fora do ar, sem acesso)", () => {
    expect(describeAssistError(new HttpError(504, "x", "A IA demorou demais para responder. Tente de novo."), fallback))
      .toBe("A IA demorou demais para responder. Tente de novo.");
    expect(describeAssistError(new HttpError(403, "x", "Acesso restrito à equipe."), fallback)).toBe("Acesso restrito à equipe.");
  });

  it("401 = sessão vencida, mesmo com mensagem do middleware", () => {
    expect(describeAssistError(new HttpError(401, "x", "Não autenticado"), fallback)).toMatch(/sessão expirou/);
  });

  it("404 sem mensagem = rota ausente nesta versão: dica do F5", () => {
    expect(describeAssistError(new HttpError(404, "Not Found"), fallback))
      .toBe("Falha ao gerar o resumo. Recarregue a página (F5) e tente de novo.");
  });

  it("5xx sem mensagem (função caiu ou estourou o tempo) e 4xx sem mensagem", () => {
    expect(describeAssistError(new HttpError(504, "Gateway Timeout"), fallback))
      .toBe("A IA não respondeu (erro 504). Tente de novo em instantes.");
    expect(describeAssistError(new HttpError(413, "Payload Too Large"), fallback)).toBe("Falha ao gerar o resumo (erro 413).");
  });

  it("rede, formato errado e desconhecido", () => {
    expect(describeAssistError(new TypeError("Failed to fetch"), fallback)).toBe("Sem conexão com o servidor. Confira a internet.");
    expect(describeAssistError(new Error("Resposta inválida da IA. Tente de novo."), fallback)).toBe("Resposta inválida da IA. Tente de novo.");
    expect(describeAssistError(new SyntaxError("Unexpected token <"), fallback)).toBe("Falha ao gerar o resumo.");
    expect(describeAssistError(undefined, fallback)).toBe("Falha ao gerar o resumo.");
  });
});

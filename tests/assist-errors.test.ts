import { describe, expect, it } from "vitest";
import {
  ASSIST_FAILURE_MESSAGE,
  AssistError,
  assistErrorStatus,
  assistFailure,
  isAssistError,
  type AssistErrorCode,
} from "@/app/_shared/utils/assist-errors";

// Erros da IA do Copiloto → status da rota POST /api/whatsapp/assist/<op>.
// A mensagem PT-BR do lib chega ao atendente (a server action mascarava em
// produção); o status separa "demorou" de "fora do ar" de "pedido inválido".

describe("assistErrorStatus", () => {
  it.each<[AssistErrorCode, number]>([
    ["timeout", 504],
    ["offline", 502],
    ["upstream", 502],
    ["not_configured", 503],
    ["not_found", 404],
    ["bad_input", 400],
  ])("%s → %i", (code, status) => {
    expect(assistErrorStatus(code)).toBe(status);
  });

  it("code desconhecido ou ausente → 500", () => {
    expect(assistErrorStatus("quebrou")).toBe(500);
    expect(assistErrorStatus("")).toBe(500);
    expect(assistErrorStatus(null)).toBe(500);
    expect(assistErrorStatus(undefined)).toBe(500);
  });
});

describe("AssistError / isAssistError", () => {
  it("continua sendo Error, com code e name", () => {
    const err = new AssistError("timeout", "A IA demorou demais para responder. Tente de novo.");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("AssistError");
    expect(err.code).toBe("timeout");
    expect(isAssistError(err)).toBe(true);
  });

  it("reconhece a cópia de outro bundle pelo name + code", () => {
    const copy = Object.assign(new Error("x"), { name: "AssistError", code: "offline" });
    expect(isAssistError(copy)).toBe(true);
  });

  it("não confunde com outros erros", () => {
    expect(isAssistError(new Error("x"))).toBe(false);
    expect(isAssistError(Object.assign(new Error("x"), { name: "AssistError" }))).toBe(false);
    expect(isAssistError({ name: "AssistError", code: "timeout", message: "x" })).toBe(false);
    expect(isAssistError(null)).toBe(false);
    expect(isAssistError("timeout")).toBe(false);
  });
});

describe("assistFailure", () => {
  it("preserva a mensagem PT-BR com o status do code", () => {
    expect(
      assistFailure(new AssistError("offline", "Serviço de IA fora do ar — não consegui falar com o chatbot. Tente de novo em instantes.")),
    ).toEqual({
      status: 502,
      error: "Serviço de IA fora do ar — não consegui falar com o chatbot. Tente de novo em instantes.",
    });
    expect(assistFailure(new AssistError("not_configured", "Serviço de IA não configurado (CHATBOT_URL/CHATBOT_SECRET)."))).toEqual({
      status: 503,
      error: "Serviço de IA não configurado (CHATBOT_URL/CHATBOT_SECRET).",
    });
    expect(assistFailure(new AssistError("bad_input", "Ainda não há conversa para resumir."))).toEqual({
      status: 400,
      error: "Ainda não há conversa para resumir.",
    });
  });

  it("AssistError sem mensagem cai no texto genérico, mantendo o status", () => {
    expect(assistFailure(new AssistError("timeout", ""))).toEqual({ status: 504, error: ASSIST_FAILURE_MESSAGE });
  });

  it("erro que não é AssistError (banco, S3, bug) → 500 genérico, sem vazar o texto cru", () => {
    const failure = assistFailure(new Error("Invalid `prisma.whatsAppContact.findUnique()` invocation: connection refused"));
    expect(failure).toEqual({ status: 500, error: ASSIST_FAILURE_MESSAGE });
    expect(assistFailure("string solta")).toEqual({ status: 500, error: ASSIST_FAILURE_MESSAGE });
    expect(assistFailure(undefined)).toEqual({ status: 500, error: ASSIST_FAILURE_MESSAGE });
  });
});

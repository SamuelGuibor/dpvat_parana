import { describe, expect, it } from "vitest";
import { isTerminalBotAction, shouldAbortSend } from "@/app/_shared/utils/bot-timing";

// Laço de envio do bot (whatsapp/bot.ts): antes de cada bloco da resposta,
// decide se o bot segue falando. Até 25/09/2026 o bot mandava tudo e ainda
// executava a ação, mesmo com o atendente já na conversa ou com o cliente
// escrevendo no meio do roteiro.

describe("isTerminalBotAction", () => {
  it("qualify, disqualify, handoff e resolve fecham o turno", () => {
    for (const a of ["qualify", "disqualify", "handoff", "resolve"]) {
      expect(isTerminalBotAction(a)).toBe(true);
    }
  });

  it("continue, send_flow e lookup não fecham", () => {
    for (const a of ["continue", "send_flow", "lookup", ""]) {
      expect(isTerminalBotAction(a)).toBe(false);
    }
  });
});

describe("shouldAbortSend", () => {
  it("sem mensagem nova e ainda com o bot: segue mandando", () => {
    expect(shouldAbortSend({ hasNewerInbound: false, stillBot: true, action: "continue", blocksSent: 0 }))
      .toBe("continue_sending");
    expect(shouldAbortSend({ hasNewerInbound: false, stillBot: true, action: "qualify", blocksSent: 2 }))
      .toBe("continue_sending");
  });

  it("conversa saiu do modo bot: para tudo, inclusive a ação", () => {
    for (const action of ["continue", "qualify", "disqualify", "handoff", "resolve", "send_flow"]) {
      expect(shouldAbortSend({ hasNewerInbound: false, stillBot: false, action, blocksSent: 0 })).toBe("stop_all");
      expect(shouldAbortSend({ hasNewerInbound: true, stillBot: false, action, blocksSent: 2 })).toBe("stop_all");
    }
  });

  it("mensagem nova antes do 1º bloco: para tudo (a invocação nova responde o lote inteiro)", () => {
    for (const action of ["continue", "qualify", "disqualify", "handoff", "resolve", "send_flow"]) {
      expect(shouldAbortSend({ hasNewerInbound: true, stillBot: true, action, blocksSent: 0 })).toBe("stop_all");
    }
  });

  it("qualify interrompido por mensagem nova no meio do roteiro: para os blocos, mas qualifica", () => {
    expect(shouldAbortSend({ hasNewerInbound: true, stillBot: true, action: "qualify", blocksSent: 1 }))
      .toBe("stop_blocks_run_action");
  });

  it("outras ações terminais no meio da resposta também rodam", () => {
    for (const action of ["disqualify", "handoff", "resolve"]) {
      expect(shouldAbortSend({ hasNewerInbound: true, stillBot: true, action, blocksSent: 3 }))
        .toBe("stop_blocks_run_action");
    }
  });

  it("continue e send_flow no meio da resposta: param (a invocação nova decide com o histórico real)", () => {
    expect(shouldAbortSend({ hasNewerInbound: true, stillBot: true, action: "continue", blocksSent: 1 }))
      .toBe("stop_all");
    expect(shouldAbortSend({ hasNewerInbound: true, stillBot: true, action: "send_flow", blocksSent: 1 }))
      .toBe("stop_all");
  });
});

import { describe, it, expect } from "vitest";
import { lastTurnText } from "../.claude/hooks/op-response.mjs";

const line = (o: unknown) => JSON.stringify(o);

describe("op-response.mjs — texto do último turno", () => {
  it("junta só o texto do app depois do último prompt (tool_use, tool_result e thinking ficam fora)", () => {
    const jsonl = [
      line({ type: "user", message: { role: "user", content: "pedido antigo" } }),
      line({ type: "assistant", message: { content: [{ type: "text", text: "resposta antiga" }] } }),
      line({ type: "user", message: { role: "user", content: [{ type: "text", text: "/processo 2342" }] } }),
      line({ type: "assistant", message: { content: [{ type: "thinking", thinking: "pensando" }, { type: "text", text: "Vou abrir o card." }, { type: "tool_use", name: "mcp__crm-op__panorama_card", input: {} }] } }),
      line({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "{...}" }] } }),
      line({ type: "assistant", message: { content: [{ type: "text", text: "O card 2342 está em AUDITORIA." }] } }),
      "{linha parcial",
    ].join("\n");
    expect(lastTurnText(jsonl)).toBe("Vou abrir o card.\n\nO card 2342 está em AUDITORIA.");
  });

  it("mensagem meta (lembrete do sistema) não abre turno novo", () => {
    const jsonl = [
      line({ type: "user", message: { content: "oi" } }),
      line({ type: "assistant", message: { content: [{ type: "text", text: "Olá." }] } }),
      line({ type: "user", isMeta: true, message: { content: "lembrete" } }),
    ].join("\n");
    expect(lastTurnText(jsonl)).toBe("Olá.");
  });

  it("sem resposta de texto devolve vazio", () => {
    expect(lastTurnText(line({ type: "user", message: { content: "oi" } }))).toBe("");
  });
});

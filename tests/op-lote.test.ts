import { describe, it, expect } from "vitest";
import { dedupeRefs, fillCardVars, hasCardVars, loteOutcome, previaTextoLote } from "@/app/_shared/utils/op-lote";

describe("lote: variáveis de card no texto", () => {
  const card = { nome: "Ana Maria Souza", cardNumber: 2342, hospital: "HOSP X" };
  it("preenche nome, primeiro_nome, numero e hospital; tag desconhecida fica", () => {
    expect(fillCardVars("Oi [[primeiro_nome]] ([[nome]]), card [[numero]] do [[hospital]] [[cpf]]", card)).toBe("Oi Ana (Ana Maria Souza), card 2342 do HOSP X [[cpf]]");
    expect(fillCardVars("[[ NOME ]]", card)).toBe("Ana Maria Souza");
    expect(fillCardVars("Oi [[nome]]", { nome: null, cardNumber: null })).toBe("Oi ");
    expect(hasCardVars("Oi [[nome]]")).toBe(true);
    expect(hasCardVars("Oi [[cpf]]")).toBe(false);
  });
  it("referências repetidas contam uma vez", () => {
    expect(dedupeRefs(["2342", "#2342", " 2342 ", "processo 2342", "2350", ""])).toEqual(["2342", "2350"]);
  });
});

describe("lote: prévia em texto", () => {
  it("texto igual sai uma vez; pulados listados com o código", () => {
    const t = previaTextoLote({
      canal: "WhatsApp",
      itens: [
        { cardNumber: 1, nome: "Ana", destino: "5541999990000 · linha A", saiComo: "texto", texto: "Oi" },
        { cardNumber: 2, nome: "Bia", destino: "5541999990001 · linha A", saiComo: "texto", texto: "Oi" },
      ],
      pulados: [{ card: "3", cardNumber: 3, nome: "Caio", code: "opt_out", message: "pediu para não receber" }],
    });
    expect(t).toContain("WHATSAPP EM LOTE — 2 envio(s), 1 pulado(s)");
    expect(t).toContain("Texto (igual para todos):\nOi");
    expect(t).toContain("card 3 (Caio): opt_out");
    expect(t.split("Oi").length - 1).toBe(1);
  });
  it("texto diferente (variáveis) sai por item", () => {
    const t = previaTextoLote({
      canal: "e-mail",
      assunto: "Pedido",
      itens: [
        { cardNumber: 1, nome: "Ana", destino: "a@h.com", texto: "Oi Ana" },
        { cardNumber: 2, nome: "Bia", destino: "b@h.com", texto: "Oi Bia" },
      ],
      pulados: [],
    });
    expect(t).toContain("Assunto: Pedido");
    expect(t).toContain("   Oi Ana");
    expect(t).toContain("   Oi Bia");
    expect(t).not.toContain("igual para todos");
  });
});

describe("lote: resultado", () => {
  it("um enviado já é executada; os que não saíram vêm com motivo", () => {
    const r = loteOutcome([
      { cardId: "a", cardNumber: 1, nome: "Ana", sent: true, via: "text" },
      { cardId: "b", cardNumber: 2, nome: "Bia", sent: false, reason: "janela fechada" },
    ]);
    expect(r).toMatchObject({ sent: true, enviados: 1, naoEnviados: 1 });
    expect(r.aviso).toMatch(/prepare de novo SÓ esses/);
    expect(loteOutcome([{ cardId: "b", cardNumber: 2, nome: "Bia", sent: false }]).sent).toBe(false);
  });
});

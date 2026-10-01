import { describe, expect, it } from "vitest";
import { STALE_BURST_GAP_MS, burstClientText } from "@/app/_shared/utils/burst-text";
import { PASSWORD_MASK, maskSecrets } from "@/app/_shared/utils/mask-secrets";

// Texto do lote que vai ao cérebro. Caso real (01/10/2026): "entendi" de 29/09
// sem resposta + "bom dia" de hoje viravam "entendi\nbom dia" e a IA ficava em
// silêncio achando que era confirmação ao atendente.
const at = (iso: string) => new Date(iso);

describe("burstClientText", () => {
  it("rajada normal sai como texto puro, uma linha por mensagem", () => {
    expect(burstClientText([
      { body: "oi", createdAt: at("2026-10-01T12:35:00Z") },
      { body: " tudo bem? ", createdAt: at("2026-10-01T12:35:20Z") },
    ])).toBe("oi\ntudo bem?");
  });

  it("marca a mensagem antiga com data/hora de Brasília e a nova com 'agora', cada marca na sua linha", () => {
    expect(burstClientText([
      { body: "entendi", createdAt: at("2026-09-29T15:48:26Z") },
      { body: "bom dia", createdAt: at("2026-10-01T12:35:43Z") },
    ])).toBe(
      "[mensagem antiga do cliente, de 29/09 às 12:48, que ficou sem resposta]\nentendi\n" +
      "[mensagem de agora, 01/10 às 09:35]\nbom dia",
    );
  });

  it("o limite é a mensagem mais nova do lote, mesmo sem texto (áudio/foto)", () => {
    const out = burstClientText([
      { body: "manda o rg?", createdAt: at("2026-10-01T08:00:00Z") },
      { body: null, createdAt: at("2026-10-01T12:00:00Z") },
    ]);
    expect(out).toBe("[mensagem antiga do cliente, de 01/10 às 05:00, que ficou sem resposta]\nmanda o rg?");
  });

  it("exatamente no limite ainda não é antiga", () => {
    const novo = at("2026-10-01T12:00:00Z");
    const limite = new Date(novo.getTime() - STALE_BURST_GAP_MS);
    expect(burstClientText([
      { body: "a", createdAt: limite },
      { body: "b", createdAt: novo },
    ])).toBe("a\nb");
  });

  it("senha mandada sozinha continua mascarada com a marca de data", () => {
    const text = burstClientText([
      { body: "Teste123@", createdAt: at("2026-09-29T14:01:37Z") },
      { body: "bom dia", createdAt: at("2026-10-01T12:35:43Z") },
    ]);
    const masked = maskSecrets(text, ["Qual a sua senha do gov.br?"]);
    expect(masked).not.toContain("Teste123");
    expect(masked).toContain(PASSWORD_MASK);
  });

  it("sem texto nenhum devolve vazio", () => {
    expect(burstClientText([{ body: "  ", createdAt: at("2026-10-01T12:00:00Z") }])).toBe("");
    expect(burstClientText([])).toBe("");
  });
});

import { describe, it, expect } from "vitest";
import { stripWaMarkup } from "@/app/nova-dash/workspace/whatsapp/wa-format";
import { renderTemplateThreadText } from "@/app/_shared/lib/whatsapp/template-text";

// A bolha da thread renderiza a marcação (formatWaText); a prévia truncada na
// lista de conversas é texto puro, então lá os marcadores têm que sumir.

describe("stripWaMarkup", () => {
  it("remove os marcadores do WhatsApp", () => {
    expect(stripWaMarkup("*negrito*")).toBe("negrito");
    expect(stripWaMarkup("_itálico_")).toBe("itálico");
    expect(stripWaMarkup("~tachado~")).toBe("tachado");
    expect(stripWaMarkup("```mono```")).toBe("mono");
  });

  it("preserva texto sem marcação e asterisco solto", () => {
    expect(stripWaMarkup("Olá, tudo bem?")).toBe("Olá, tudo bem?");
    expect(stripWaMarkup("2 * 3 = 6")).toBe("2 * 3 = 6");
  });

  it("limpa o cabeçalho do template na prévia da lista", () => {
    const texto = renderTemplateThreadText(
      { name: "resgate_1", headerText: "Seguros Paraná", bodyPreview: "Oi!", footerText: "Responda SAIR." },
      [],
    );
    expect(texto.startsWith("*Seguros Paraná*")).toBe(true);
    expect(stripWaMarkup(texto).startsWith("Seguros Paraná")).toBe(true);
    expect(stripWaMarkup(texto)).not.toContain("*");
  });
});

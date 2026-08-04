import { describe, it, expect } from "vitest";
import { renderTemplateThreadText } from "@/app/_shared/lib/whatsapp/template-text";

// O texto salvo na thread tem que ser o que o cliente leu no celular:
// cabeçalho em negrito, corpo com as variáveis trocadas e rodapé.

const resgate = {
  name: "resgate_1",
  headerText: "Seguros Paraná",
  bodyPreview: "Oi, eu novamente!\nPodemos avançar juntos?",
  footerText: "Responda SAIR para não receber mais.",
};

describe("renderTemplateThreadText", () => {
  it("monta cabeçalho em negrito + corpo + rodapé", () => {
    expect(renderTemplateThreadText(resgate, [])).toBe(
      "*Seguros Paraná*\n\nOi, eu novamente!\nPodemos avançar juntos?\n\nResponda SAIR para não receber mais.",
    );
  });

  it("não perde o rodapé (regressão do envio manual)", () => {
    expect(renderTemplateThreadText(resgate, [])).toContain("Responda SAIR para não receber mais.");
  });

  it("não perde o cabeçalho (regressão do envio automático)", () => {
    expect(renderTemplateThreadText(resgate, [])).toContain("*Seguros Paraná*");
  });

  it("troca as variáveis do corpo na ordem", () => {
    const t = { name: "atualizacao_status", bodyPreview: "Olá {{1}}, seu caso está em {{2}}." };
    expect(renderTemplateThreadText(t, ["João", "análise"])).toBe("Olá João, seu caso está em análise.");
  });

  it("troca {{1}} do cabeçalho pelo headerVar", () => {
    const t = { name: "oi", headerText: "Olá {{1}}", bodyPreview: "Tudo bem?" };
    expect(renderTemplateThreadText(t, [], "Maria")).toBe("*Olá Maria*\n\nTudo bem?");
  });

  it("omite as partes ausentes sem deixar linha em branco sobrando", () => {
    const t = { name: "so_corpo", headerText: null, bodyPreview: "Só o corpo.", footerText: null };
    expect(renderTemplateThreadText(t, [])).toBe("Só o corpo.");
  });

  it("ignora cabeçalho e rodapé que são só espaço em branco", () => {
    const t = { name: "x", headerText: "   ", bodyPreview: "Corpo.", footerText: "  " };
    expect(renderTemplateThreadText(t, [])).toBe("Corpo.");
  });

  it("cai no nome do template quando não há corpo cadastrado", () => {
    const t = { name: "sem_corpo", bodyPreview: null };
    expect(renderTemplateThreadText(t, [])).toBe("[Template: sem_corpo]");
    expect(renderTemplateThreadText(t, ["a", "b"])).toBe("[Template: sem_corpo] (a, b)");
  });
});

import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/_shared/lib/prisma", () => ({ db: {} }));
vi.mock("@/app/_shared/lib/whatsapp/numbers", () => ({ getInactiveNumberIds: async () => [] }));

import { alcance, motivoBloqueio, resolveDia, resolvePeriodo, STATUS_DA_PASTA, PASTA_DO_STATUS } from "@/app/_shared/utils/op-conversas";
import { matchLinha } from "@/app/_shared/lib/op/conversas";
import { previaTextoLote } from "@/app/_shared/utils/op-lote";

// 04/11 10:00 em Brasília = 13:00 UTC; 04/11 23:30 BRT = 05/11 02:30 UTC (ainda é dia 04 no Brasil).
const MANHA = new Date("2026-11-04T13:00:00Z");
const NOITE = new Date("2026-11-05T02:30:00Z");

describe("datas do filtro (Brasília)", () => {
  it("hoje/ontem/-N pelo dia de Brasília, não pelo UTC", () => {
    expect(resolveDia("hoje", MANHA)).toBe("2026-11-04");
    expect(resolveDia("ontem", MANHA)).toBe("2026-11-03");
    expect(resolveDia("hoje", NOITE)).toBe("2026-11-04");
    expect(resolveDia("ontem", NOITE)).toBe("2026-11-03");
    expect(resolveDia("-3", MANHA)).toBe("2026-11-01");
    expect(resolveDia("anteontem", MANHA)).toBe("2026-11-02");
  });

  it("AAAA-MM-DD e DD/MM/AAAA; data impossível = null", () => {
    expect(resolveDia("2026-11-01")).toBe("2026-11-01");
    expect(resolveDia("01/11/2026")).toBe("2026-11-01");
    expect(resolveDia("31/02/2026")).toBeNull();
    expect(resolveDia("semana passada")).toBeNull();
  });

  it("período: sem ate = até hoje; invertido e inválido dão erro; nada = null", () => {
    expect(resolvePeriodo("ontem", undefined, MANHA)).toEqual({ de: "2026-11-03", ate: "2026-11-04" });
    expect(resolvePeriodo("hoje", "ontem", MANHA)).toEqual({ erro: "ate é anterior a desde" });
    expect(resolvePeriodo("xx", undefined, MANHA)).toMatchObject({ erro: expect.stringContaining("desde") });
    expect(resolvePeriodo(undefined, undefined, MANHA)).toBeNull();
  });
});

describe("pastas e alcance", () => {
  it("pastas espelham o status do inbox (recuperação = standby)", () => {
    expect(STATUS_DA_PASTA.recuperacao).toBe("standby");
    expect(STATUS_DA_PASTA.fila).toBe("queued");
    expect(PASTA_DO_STATUS.human).toBe("atendimento");
  });

  it("texto só com janela; fora dela só template com opt-in; opt-out e linha inativa bloqueiam", () => {
    const base = { optedOut: false, optedIn: false, janelaAberta: true, linhaAtiva: true };
    expect(alcance(base)).toBe("texto");
    expect(alcance({ ...base, janelaAberta: false })).toBe("bloqueado");
    expect(motivoBloqueio({ ...base, janelaAberta: false })).toBe("janela_fechada_sem_opt_in");
    expect(alcance({ ...base, janelaAberta: false, optedIn: true })).toBe("so_template");
    expect(motivoBloqueio({ ...base, optedOut: true })).toBe("opt_out");
    expect(alcance({ ...base, linhaAtiva: false })).toBe("bloqueado");
    // linha com templates pausados: fora da janela não sai nada; dentro, texto sai
    expect(motivoBloqueio({ ...base, janelaAberta: false, optedIn: true, templatesPausados: true })).toBe("templates_pausados");
    expect(alcance({ ...base, templatesPausados: true })).toBe("texto");
  });
});

describe("linha pelo nome ou telefone", () => {
  const linhas = [
    { id: "n1", label: "Seguros Paraná IA", displayPhone: "+55 41 9999-1111", active: true, isDefault: true },
    { id: "n2", label: "Paraná DPVAT", displayPhone: "+55 41 9786-2323", active: false, isDefault: false },
  ];
  it("nome sem acento/caixa, parcial único, telefone", () => {
    expect(matchLinha(linhas, "seguros parana ia").id).toBe("n1");
    expect(matchLinha(linhas, "dpvat").id).toBe("n2");
    expect(matchLinha(linhas, "41 97862323").id).toBe("n2");
  });
  it("ambíguo e inexistente trazem as linhas", () => {
    expect(() => matchLinha(linhas, "parana")).toThrow(expect.objectContaining({ code: "ambiguo" }));
    expect(() => matchLinha(linhas, "comercial")).toThrow(expect.objectContaining({ code: "nao_encontrado" }));
  });
});

describe("prévia do lote por conversa", () => {
  it("contato sem card aparece como 'sem card' e pulado pelo telefone", () => {
    const t = previaTextoLote({
      canal: "WhatsApp",
      itens: [{ cardNumber: null, nome: "Carlos", destino: "5541988887777 · linha Seguros Paraná IA", saiComo: "texto", texto: "Oi" }],
      pulados: [{ card: "5541977776666", cardNumber: null, nome: "Bia", code: "ja_recebeu", message: "já recebeu" }],
    });
    expect(t).toContain("1. sem card (Carlos)");
    expect(t).toContain("- 5541977776666 (Bia): ja_recebeu");
  });
});

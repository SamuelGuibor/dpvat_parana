import { describe, expect, it } from "vitest";
import {
  DEFAULT_STRATEGIC_TAB,
  STRATEGIC_TABS,
  STRATEGIC_TAB_STORAGE_KEY,
  WORKSPACE_SECTIONS,
  WORKSPACE_SECTION_STORAGE_KEY,
  parseStrategicTab,
  parseWorkspaceSection,
  readViewValue,
  visibleStrategicTab,
  writeViewValue,
  type ViewStorage,
} from "@/app/_shared/utils/dashboard-view-state";

// Aba da Gestão Estratégica e seção do Espaço de Trabalho que sobrevivem à
// troca de período, à troca de aba da nova-dash e ao F5 (auditoria de
// 25/09/2026, PAINEL-4).

function memoryStorage(initial: Record<string, string> = {}): ViewStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = v; },
  };
}

/** Storage bloqueado (modo privado, política do navegador): todo acesso lança. */
const blockedStorage: ViewStorage = {
  getItem: () => { throw new Error("SecurityError"); },
  setItem: () => { throw new Error("QuotaExceededError"); },
};

describe("parseStrategicTab", () => {
  it("aceita as abas visíveis", () => {
    for (const tab of STRATEGIC_TABS) expect(parseStrategicTab(tab)).toBe(tab);
  });

  it("nunca restaura o Calendário, ainda escondido", () => {
    expect(parseStrategicTab("calendario")).toBeNull();
  });

  it("valor estranho, vazio ou ausente vira null", () => {
    expect(parseStrategicTab("Analytics")).toBeNull();
    expect(parseStrategicTab("")).toBeNull();
    expect(parseStrategicTab(null)).toBeNull();
    expect(parseStrategicTab(undefined)).toBeNull();
    expect(parseStrategicTab("__proto__")).toBeNull();
  });
});

describe("visibleStrategicTab", () => {
  it("aba Chatbot sem a allowlist cai em Analytics", () => {
    expect(visibleStrategicTab("chatbot", false)).toBe(DEFAULT_STRATEGIC_TAB);
    expect(DEFAULT_STRATEGIC_TAB).toBe("analytics");
  });

  it("aba Chatbot com a allowlist fica", () => {
    expect(visibleStrategicTab("chatbot", true)).toBe("chatbot");
  });

  it("as outras abas não dependem da allowlist", () => {
    for (const tab of ["analytics", "fluxo", "form-leads"] as const) {
      expect(visibleStrategicTab(tab, false)).toBe(tab);
      expect(visibleStrategicTab(tab, true)).toBe(tab);
    }
  });
});

describe("parseWorkspaceSection", () => {
  it("aceita as seções do Espaço de Trabalho, menos o chat desligado", () => {
    for (const section of WORKSPACE_SECTIONS) {
      expect(parseWorkspaceSection(section)).toBe(section === "chat" ? null : section);
    }
  });

  it("valor estranho vira null (a guarda por permissão continua no Workspace)", () => {
    expect(parseWorkspaceSection("contratados")).toBeNull();
    expect(parseWorkspaceSection("")).toBeNull();
    expect(parseWorkspaceSection(null)).toBeNull();
  });
});

describe("readViewValue / writeViewValue", () => {
  it("grava e lê de volta pela chave", () => {
    const storage = memoryStorage();
    writeViewValue(storage, STRATEGIC_TAB_STORAGE_KEY, "chatbot");
    writeViewValue(storage, WORKSPACE_SECTION_STORAGE_KEY, "dashboard");
    expect(parseStrategicTab(readViewValue(storage, STRATEGIC_TAB_STORAGE_KEY))).toBe("chatbot");
    expect(parseWorkspaceSection(readViewValue(storage, WORKSPACE_SECTION_STORAGE_KEY))).toBe("dashboard");
  });

  it("storage bloqueado ou ausente nunca lança: cai no padrão", () => {
    expect(readViewValue(blockedStorage, STRATEGIC_TAB_STORAGE_KEY)).toBeNull();
    expect(() => writeViewValue(blockedStorage, STRATEGIC_TAB_STORAGE_KEY, "fluxo")).not.toThrow();
    expect(readViewValue(null, STRATEGIC_TAB_STORAGE_KEY)).toBeNull();
    expect(() => writeViewValue(null, STRATEGIC_TAB_STORAGE_KEY, "fluxo")).not.toThrow();
  });

  it("chave sem valor devolve null", () => {
    expect(readViewValue(memoryStorage(), STRATEGIC_TAB_STORAGE_KEY)).toBeNull();
  });
});

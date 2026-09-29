import { describe, expect, it } from "vitest";
import {
  INBOX_FOLDER_KEYS,
  INBOX_VIEW_STORAGE_KEY,
  OPEN_CONTACT_STORAGE_KEY,
  parseInboxViewState,
  pruneColumnFilter,
  pruneTagFilter,
  restoreInboxView,
  saveInboxViewState,
  serializeInboxViewState,
  takeOpenContactRequest,
  type InboxViewState,
  type InboxViewStorage,
} from "@/app/_shared/utils/inbox-view-state";

// Navegação do inbox que sobrevive à troca de aba da nova-dash (auditoria de
// 24/09/2026, THR-4/LISTA-9): voltar do Kanban perdia conversa, pasta e busca.

const FULL: InboxViewState = {
  contactId: "ck_contato_1",
  folder: "qualified",
  search: "ma",
  tagFilter: ["tag_a", "tag_b"],
  dateRange: { from: "2026-09-01", to: "2026-09-25", label: "Este mês" },
  columnFilter: "INSS - Perícia",
  contactsMode: false,
};

const EMPTY: InboxViewState = {
  contactId: null,
  folder: "todos",
  search: "",
  tagFilter: [],
  dateRange: null,
  columnFilter: null,
  contactsMode: false,
};

function memoryStorage(initial: Record<string, string> = {}): InboxViewStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => { data.set(k, v); },
    removeItem: (k) => { data.delete(k); },
  };
}

const throwingStorage: InboxViewStorage = {
  getItem: () => { throw new Error("SecurityError"); },
  setItem: () => { throw new Error("QuotaExceededError"); },
  removeItem: () => { throw new Error("SecurityError"); },
};

describe("parseInboxViewState / serializeInboxViewState", () => {
  it("round-trip devolve o mesmo estado", () => {
    expect(parseInboxViewState(serializeInboxViewState(FULL))).toEqual(FULL);
    expect(parseInboxViewState(serializeInboxViewState(EMPTY))).toEqual(EMPTY);
    expect(parseInboxViewState(serializeInboxViewState({ ...EMPTY, contactsMode: true, folder: "descartado" })))
      .toEqual({ ...EMPTY, contactsMode: true, folder: "descartado" });
  });

  it("toda pasta do rail faz round-trip", () => {
    for (const folder of INBOX_FOLDER_KEYS) {
      expect(parseInboxViewState(serializeInboxViewState({ ...EMPTY, folder }))?.folder).toBe(folder);
    }
  });

  it("JSON inválido, vazio ou que não é objeto → null", () => {
    expect(parseInboxViewState(null)).toBeNull();
    expect(parseInboxViewState(undefined)).toBeNull();
    expect(parseInboxViewState("")).toBeNull();
    expect(parseInboxViewState("{quebrado")).toBeNull();
    expect(parseInboxViewState("null")).toBeNull();
    expect(parseInboxViewState("42")).toBeNull();
    expect(parseInboxViewState('"texto"')).toBeNull();
    expect(parseInboxViewState("[1,2]")).toBeNull();
  });

  it("pasta desconhecida → 'todos'", () => {
    expect(parseInboxViewState(JSON.stringify({ ...FULL, folder: "lixeira" }))?.folder).toBe("todos");
    expect(parseInboxViewState(JSON.stringify({ ...FULL, folder: 3 }))?.folder).toBe("todos");
    expect(parseInboxViewState(JSON.stringify({ search: "x" }))?.folder).toBe("todos");
  });

  it("tagFilter que não é array → []; itens que não são id válido saem", () => {
    expect(parseInboxViewState(JSON.stringify({ ...FULL, tagFilter: "tag_a" }))?.tagFilter).toEqual([]);
    expect(parseInboxViewState(JSON.stringify({ ...FULL, tagFilter: { a: 1 } }))?.tagFilter).toEqual([]);
    expect(parseInboxViewState(JSON.stringify({ ...FULL, tagFilter: ["a", 2, null, "", "a", "b"] }))?.tagFilter)
      .toEqual(["a", "b"]);
  });

  it("campos inválidos voltam ao padrão sem derrubar o resto", () => {
    const parsed = parseInboxViewState(JSON.stringify({
      contactId: 123,
      folder: "bot",
      search: ["x"],
      dateRange: { from: "25/09/2026", to: "2026-09-25", label: "Hoje" },
      columnFilter: "",
      contactsMode: "true",
    }));
    expect(parsed).toEqual({ ...EMPTY, folder: "bot" });
  });

  it("intervalo de data invertido ou sem rótulo → null", () => {
    expect(parseInboxViewState(JSON.stringify({ ...FULL, dateRange: { from: "2026-09-25", to: "2026-09-01", label: "x" } }))?.dateRange)
      .toBeNull();
    expect(parseInboxViewState(JSON.stringify({ ...FULL, dateRange: { from: "2026-09-01", to: "2026-09-02" } }))?.dateRange)
      .toBeNull();
  });

  it("serializa só os campos conhecidos", () => {
    const withExtra = { ...FULL, extra: "não grava" } as InboxViewState;
    expect(JSON.parse(serializeInboxViewState(withExtra))).not.toHaveProperty("extra");
  });
});

describe("restoreInboxView (precedência do wa-open-contact)", () => {
  it("sem nada salvo e sem pedido → null", () => {
    expect(restoreInboxView(memoryStorage())).toBeNull();
    expect(restoreInboxView(null)).toBeNull();
  });

  it("devolve a navegação salva", () => {
    const s = memoryStorage({ [INBOX_VIEW_STORAGE_KEY]: serializeInboxViewState(FULL) });
    expect(restoreInboxView(s)).toEqual({ view: FULL, fromRequest: false });
  });

  it("o pedido de abertura vence o contactId salvo e mantém pasta/filtros", () => {
    const s = memoryStorage({
      [INBOX_VIEW_STORAGE_KEY]: serializeInboxViewState(FULL),
      [OPEN_CONTACT_STORAGE_KEY]: "ck_da_notificacao",
    });
    expect(restoreInboxView(s)).toEqual({ view: { ...FULL, contactId: "ck_da_notificacao" }, fromRequest: true });
    // Consumido: a próxima montagem (ou um F5) não reabre a conversa do pedido.
    expect(s.data.has(OPEN_CONTACT_STORAGE_KEY)).toBe(false);
  });

  it("pedido sem navegação salva → estado limpo com a conversa do pedido", () => {
    const s = memoryStorage({ [OPEN_CONTACT_STORAGE_KEY]: "ck_x" });
    expect(restoreInboxView(s)).toEqual({ view: { ...EMPTY, contactId: "ck_x" }, fromRequest: true });
  });

  it("navegação salva estragada + pedido → só o pedido", () => {
    const s = memoryStorage({ [INBOX_VIEW_STORAGE_KEY]: "{", [OPEN_CONTACT_STORAGE_KEY]: "ck_x" });
    expect(restoreInboxView(s)).toEqual({ view: { ...EMPTY, contactId: "ck_x" }, fromRequest: true });
  });

  it("storage que lança não quebra o inbox", () => {
    expect(restoreInboxView(throwingStorage)).toBeNull();
    expect(takeOpenContactRequest(throwingStorage)).toBeNull();
    expect(() => saveInboxViewState(throwingStorage, FULL)).not.toThrow();
    expect(() => saveInboxViewState(null, FULL)).not.toThrow();
  });

  it("saveInboxViewState grava o que o restore lê", () => {
    const s = memoryStorage();
    saveInboxViewState(s, FULL);
    expect(restoreInboxView(s)?.view).toEqual(FULL);
  });
});

describe("pruneTagFilter", () => {
  const tags = [{ id: "a" }, { id: "b" }];

  it("tira do filtro as tags que não existem mais", () => {
    expect(pruneTagFilter(["a", "x", "b"], tags)).toEqual(["a", "b"]);
  });

  it("devolve a mesma referência quando nada muda", () => {
    const filter = ["a", "b"];
    expect(pruneTagFilter(filter, tags)).toBe(filter);
    const empty: string[] = [];
    expect(pruneTagFilter(empty, tags)).toBe(empty);
  });

  it("tags ainda não carregadas não mexem no filtro", () => {
    const filter = ["x"];
    expect(pruneTagFilter(filter, undefined)).toBe(filter);
  });
});

describe("pruneColumnFilter (coluna do Kanban pelo id da Label)", () => {
  const columns = [{ id: "l1", name: "INSS - Perícia" }, { id: "l2", name: "AFASTADOS" }];

  it("id conhecido fica", () => {
    expect(pruneColumnFilter("l2", columns)).toBe("l2");
  });

  it("estado salvo com o NOME da coluna (antes de 26/09) vira o id", () => {
    expect(pruneColumnFilter("INSS - Perícia", columns)).toBe("l1");
  });

  it("coluna apagada sai do filtro (nada de lista vazia com o chip ligado)", () => {
    expect(pruneColumnFilter("sumiu", columns)).toBeNull();
  });

  it("sem filtro ou colunas ainda não carregadas: fica como está", () => {
    expect(pruneColumnFilter(null, columns)).toBeNull();
    expect(pruneColumnFilter("INSS - Perícia", undefined)).toBe("INSS - Perícia");
  });
});

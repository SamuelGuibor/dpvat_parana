import { describe, expect, it } from "vitest";
import type { WhatsAppConversationDTO } from "@/app/_shared/lib/whatsapp/inbox-types";
import {
  INBOX_COLUMNS_URL,
  INBOX_CONVERSATIONS_URL,
  INBOX_SEARCH_URL,
  INBOX_VERSION_URL,
  inboxConversationUrl,
  inboxDeltaUrl,
  inboxFilterUrl,
  readInboxColumns,
  readInboxDelta,
  readInboxFilter,
  readInboxItem,
  readInboxItems,
  readInboxList,
  readInboxVersion,
} from "@/app/_shared/utils/inbox-api";
import { inboxFilterQuery } from "@/app/_shared/utils/inbox-filter";

// Endereços e leitura das respostas das rotas GET do inbox (lista, versão,
// busca e conversa por contato), que tiraram essas leituras da fila serial de
// server actions. Resposta 2xx fora do formato LANÇA: o SWR guarda o erro e
// mantém a lista na tela, em vez de guardar lixo como "nenhuma conversa".

const conv = (id: string) => ({ id, contactId: `c-${id}` }) as unknown as WhatsAppConversationDTO;

describe("endereços das rotas do inbox", () => {
  it("rotas da equipe fora de /api/whatsapp/webhook, /cron e /brain-prompt (allowlists do middleware)", () => {
    for (const url of [INBOX_CONVERSATIONS_URL, INBOX_VERSION_URL, INBOX_SEARCH_URL, INBOX_COLUMNS_URL]) {
      expect(url.startsWith("/api/whatsapp/inbox/")).toBe(true);
    }
  });

  it("contactId e termo vão codificados na query", () => {
    expect(inboxConversationUrl("abc123")).toBe("/api/whatsapp/inbox/conversations?contactId=abc123");
    expect(inboxConversationUrl("a&b=c")).toBe("/api/whatsapp/inbox/conversations?contactId=a%26b%3Dc");
    expect(inboxFilterUrl(inboxFilterQuery({ term: "João da Silva" }))).toBe("/api/whatsapp/inbox/search?q=Jo%C3%A3o+da+Silva");
    expect(inboxFilterUrl(inboxFilterQuery({ term: "+55 (41) 9" }))).toBe("/api/whatsapp/inbox/search?q=%2B55+%2841%29+9");
  });

  it("delta: since codificado na query da mesma rota da lista", () => {
    expect(inboxDeltaUrl("2026-09-26T11:59:55.000Z")).toBe(
      "/api/whatsapp/inbox/conversations?since=2026-09-26T11%3A59%3A55.000Z",
    );
  });

  it("filtro + página: skip só a partir da 2ª página", () => {
    const q = inboxFilterQuery({ tagIds: ["t1"], fromDay: "2026-09-01", toDay: "2026-09-24" });
    expect(inboxFilterUrl(q)).toBe("/api/whatsapp/inbox/search?tag=t1&from=2026-09-01&to=2026-09-24");
    expect(inboxFilterUrl(q, 300)).toBe("/api/whatsapp/inbox/search?tag=t1&from=2026-09-01&to=2026-09-24&skip=300");
    expect(inboxFilterUrl("", 0)).toBe("/api/whatsapp/inbox/search");
  });
});

describe("readInboxFilter (busca/filtro com total real)", () => {
  it("devolve itens e total", () => {
    const items = [conv("1")];
    expect(readInboxFilter({ items, total: 364 })).toEqual({ items, total: 364 });
  });

  it("servidor antigo sem total: o total é o que veio (nada de 'X de Y' inventado)", () => {
    const items = [conv("1"), conv("2")];
    expect(readInboxFilter({ items })).toEqual({ items, total: 2 });
    expect(readInboxFilter({ items, total: -1 })).toEqual({ items, total: 2 });
  });

  it("sem items lança", () => {
    expect(() => readInboxFilter({ total: 3 })).toThrow("Resposta inválida");
  });
});

describe("readInboxColumns (colunas do Kanban)", () => {
  it("devolve id, nome e contagem; linha fora do formato sai", () => {
    expect(readInboxColumns({
      items: [
        { id: "l1", name: "AFASTADOS", count: 15 },
        { id: "l2", name: "COLHER ASSINATURA", count: "x" },
        { id: 3, name: "lixo" },
        null,
      ],
    })).toEqual([
      { id: "l1", name: "AFASTADOS", count: 15 },
      { id: "l2", name: "COLHER ASSINATURA", count: 0 },
    ]);
  });

  it("sem items lança", () => {
    expect(() => readInboxColumns({ error: "x" })).toThrow("Resposta inválida");
  });
});

describe("readInboxItems (lista e busca)", () => {
  it("devolve os itens de { items }", () => {
    const items = [conv("1"), conv("2")];
    expect(readInboxItems({ items, cursor: null })).toBe(items);
    expect(readInboxItems({ items: [] })).toEqual([]);
  });

  it.each([
    ["null", null],
    ["array cru", [conv("1")]],
    ["sem items", { cursor: null }],
    ["items não-array", { items: "x" }],
    ["{ error } com 200", { error: "Falha ao carregar. Tente de novo." }],
  ])("formato errado (%s) lança", (_nome, body) => {
    expect(() => readInboxItems(body)).toThrow("Resposta inválida");
  });
});

describe("readInboxItem (conversa por contato)", () => {
  it("devolve o item ou null quando o contato não tem conversa", () => {
    const c = conv("1");
    expect(readInboxItem({ item: c })).toBe(c);
    expect(readInboxItem({ item: null })).toBeNull();
  });

  it("sem a chave item lança (não confunde erro com 'sem conversa')", () => {
    expect(() => readInboxItem({})).toThrow("Resposta inválida");
    expect(() => readInboxItem(null)).toThrow("Resposta inválida");
    expect(() => readInboxItem({ error: "x" })).toThrow("Resposta inválida");
  });
});

describe("readInboxVersion (hash + total)", () => {
  it("devolve hash e total", () => {
    expect(readInboxVersion({ version: "ddfd", total: 5024 })).toEqual({ version: "ddfd", total: 5024 });
  });

  it("total ausente, negativo ou inválido vira 0 (o badge some, a lista segue)", () => {
    expect(readInboxVersion({ version: "v" })).toEqual({ version: "v", total: 0 });
    expect(readInboxVersion({ version: "v", total: -3 })).toEqual({ version: "v", total: 0 });
    expect(readInboxVersion({ version: "v", total: "12" })).toEqual({ version: "v", total: 0 });
    expect(readInboxVersion({ version: "v", total: Number.NaN })).toEqual({ version: "v", total: 0 });
    expect(readInboxVersion({ version: "v", total: 7.9 })).toEqual({ version: "v", total: 7 });
  });

  it("sem version string lança (o bundle antigo devolvia a string crua)", () => {
    expect(() => readInboxVersion("ddfd")).toThrow("Resposta inválida");
    expect(() => readInboxVersion({ total: 1 })).toThrow("Resposta inválida");
    expect(() => readInboxVersion(null)).toThrow("Resposta inválida");
  });
});

describe("readInboxList (lista completa com cursor)", () => {
  it("devolve itens, cursor e total", () => {
    const items = [conv("1")];
    expect(readInboxList({ items, cursor: "2026-09-26T12:00:00.000Z", total: 5028 })).toEqual({
      items, cursor: "2026-09-26T12:00:00.000Z", total: 5028,
    });
  });

  it("servidor sem cursor (antes do delta) ainda vale: cursor null, total 0", () => {
    expect(readInboxList({ items: [], cursor: null })).toEqual({ items: [], cursor: null, total: 0 });
    expect(readInboxList({ items: [], cursor: "ontem", total: -1 })).toEqual({ items: [], cursor: null, total: 0 });
  });

  it("sem items lança", () => {
    expect(() => readInboxList({ cursor: "2026-09-26T12:00:00.000Z" })).toThrow("Resposta inválida");
  });
});

describe("readInboxDelta (só o que mudou)", () => {
  it("devolve itens, cursor, full e total", () => {
    const items = [conv("1")];
    expect(readInboxDelta({ items, cursor: "2026-09-26T12:00:00.000Z", full: false, total: 10 })).toEqual({
      items, cursor: "2026-09-26T12:00:00.000Z", full: false, total: 10,
    });
  });

  it("full sem cursor nem total vale (since inválido: a rota nem lê o banco)", () => {
    expect(readInboxDelta({ items: [], cursor: null, full: true, total: null })).toEqual({
      items: [], cursor: null, full: true, total: null,
    });
  });

  it.each([
    ["sem full", { items: [], cursor: "2026-09-26T12:00:00.000Z" }],
    ["full não-booleano", { items: [], cursor: "2026-09-26T12:00:00.000Z", full: "false" }],
    ["delta sem cursor", { items: [], cursor: null, full: false }],
    ["delta com cursor inválido", { items: [], cursor: "x", full: false }],
    ["sem items", { cursor: "2026-09-26T12:00:00.000Z", full: false }],
  ])("formato errado (%s) lança", (_nome, body) => {
    expect(() => readInboxDelta(body)).toThrow("Resposta inválida");
  });
});

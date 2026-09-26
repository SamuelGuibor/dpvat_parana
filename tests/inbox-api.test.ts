import { describe, expect, it } from "vitest";
import type { WhatsAppConversationDTO } from "@/app/_shared/lib/whatsapp/inbox-types";
import {
  INBOX_CONVERSATIONS_URL,
  INBOX_SEARCH_URL,
  INBOX_VERSION_URL,
  inboxConversationUrl,
  inboxSearchUrl,
  readInboxItem,
  readInboxItems,
  readInboxVersion,
} from "@/app/_shared/utils/inbox-api";

// Endereços e leitura das respostas das rotas GET do inbox (lista, versão,
// busca e conversa por contato), que tiraram essas leituras da fila serial de
// server actions. Resposta 2xx fora do formato LANÇA: o SWR guarda o erro e
// mantém a lista na tela, em vez de guardar lixo como "nenhuma conversa".

const conv = (id: string) => ({ id, contactId: `c-${id}` }) as unknown as WhatsAppConversationDTO;

describe("endereços das rotas do inbox", () => {
  it("rotas da equipe fora de /api/whatsapp/webhook, /cron e /brain-prompt (allowlists do middleware)", () => {
    for (const url of [INBOX_CONVERSATIONS_URL, INBOX_VERSION_URL, INBOX_SEARCH_URL]) {
      expect(url.startsWith("/api/whatsapp/inbox/")).toBe(true);
    }
  });

  it("contactId e termo vão codificados na query", () => {
    expect(inboxConversationUrl("abc123")).toBe("/api/whatsapp/inbox/conversations?contactId=abc123");
    expect(inboxConversationUrl("a&b=c")).toBe("/api/whatsapp/inbox/conversations?contactId=a%26b%3Dc");
    expect(inboxSearchUrl("João da Silva")).toBe("/api/whatsapp/inbox/search?q=Jo%C3%A3o%20da%20Silva");
    expect(inboxSearchUrl("+55 (41) 9")).toBe("/api/whatsapp/inbox/search?q=%2B55%20(41)%209");
  });

  it("o termo vai como veio: quem apara e corta em 2 caracteres é o servidor", () => {
    expect(inboxSearchUrl(" a ")).toBe("/api/whatsapp/inbox/search?q=%20a%20");
    expect(inboxSearchUrl("")).toBe("/api/whatsapp/inbox/search?q=");
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

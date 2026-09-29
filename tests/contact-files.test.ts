import { describe, expect, it } from "vitest";
import {
  ATTACH_BATCH_MAX, CONTACT_FILES_URL, CONTACT_MEDIA_PAGE, CONTACT_NOTES_PAGE, contactFilesUrl, flattenPages,
  latestBotNote, latestMediaMessageId, mergeNotes, nextPageCursor, parseContactFilesParams, readContactFilesPage,
  type ContactNoteItem,
} from "@/app/_shared/utils/contact-files";
import { isDocumentCategory } from "@/app/_shared/lib/document-categories";

// Abas Arquivos e Notas do Copiloto a partir de TODA a conversa do contato
// (não só a janela de 50 mensagens da thread): URL/key do SWR, validação da
// query na rota, leitura das páginas e a fusão das notas vivas com o histórico.

function params(q: string) {
  return new URLSearchParams(q);
}

describe("contactFilesUrl", () => {
  it("mídia: direção sempre presente, flag só quando ligada, na mesma ordem (key estável do SWR)", () => {
    expect(contactFilesUrl({ contactId: "c1", kind: "media" })).toBe(
      `${CONTACT_FILES_URL}?contactId=c1&kind=media&direction=in`,
    );
    expect(contactFilesUrl({ contactId: "c1", kind: "media", direction: "all", onlyUnattached: true })).toBe(
      `${CONTACT_FILES_URL}?contactId=c1&kind=media&direction=all&onlyUnattached=1`,
    );
  });

  it("notas não levam direção nem flag de anexo", () => {
    expect(contactFilesUrl({ contactId: "c1", kind: "notes", direction: "all", onlyUnattached: true })).toBe(
      `${CONTACT_FILES_URL}?contactId=c1&kind=notes`,
    );
  });

  it("cursor codificado; beforeId só junto do before", () => {
    const url = contactFilesUrl({
      contactId: "c 1", kind: "notes", before: "2026-09-24T10:00:00.000Z", beforeId: "m9",
    });
    expect(url).toContain("contactId=c+1");
    expect(url).toContain("before=2026-09-24T10%3A00%3A00.000Z&beforeId=m9");
    expect(contactFilesUrl({ contactId: "c1", kind: "notes", beforeId: "m9" })).not.toContain("beforeId");
  });
});

describe("parseContactFilesParams", () => {
  it("contactId é obrigatório", () => {
    expect(parseContactFilesParams(params("kind=media"))).toEqual({ error: "contactId obrigatório." });
    expect(parseContactFilesParams(params("contactId=%20%20"))).toEqual({ error: "contactId obrigatório." });
  });

  it("padrões: mídia do cliente, sem filtro de anexo, página de 24", () => {
    expect(parseContactFilesParams(params("contactId=c1"))).toEqual({
      value: {
        contactId: "c1", kind: "media", direction: "in", onlyUnattached: false, before: null, beforeId: null,
        limit: CONTACT_MEDIA_PAGE,
      },
    });
  });

  it("notas: página própria", () => {
    const r = parseContactFilesParams(params("contactId=c1&kind=notes"));
    expect("value" in r && r.value.limit).toBe(CONTACT_NOTES_PAGE);
  });

  it("valor desconhecido é 400, não vira o padrão em silêncio", () => {
    expect(parseContactFilesParams(params("contactId=c1&kind=fotos"))).toHaveProperty("error");
    expect(parseContactFilesParams(params("contactId=c1&direction=out"))).toHaveProperty("error");
    expect(parseContactFilesParams(params("contactId=c1&onlyUnattached=sim"))).toHaveProperty("error");
    expect(parseContactFilesParams(params("contactId=c1&before=ontem"))).toHaveProperty("error");
  });

  it("flag e cursor: normaliza o ISO; beforeId sem before é ignorado", () => {
    const r = parseContactFilesParams(
      params("contactId=c1&onlyUnattached=1&direction=all&before=2026-09-24T10:00:00Z&beforeId=m9"),
    );
    expect(r).toEqual({
      value: {
        contactId: "c1", kind: "media", direction: "all", onlyUnattached: true,
        before: "2026-09-24T10:00:00.000Z", beforeId: "m9", limit: CONTACT_MEDIA_PAGE,
      },
    });
    const noBefore = parseContactFilesParams(params("contactId=c1&beforeId=m9"));
    expect("value" in noBefore && noBefore.value.beforeId).toBe(null);
  });

  it("limit: teto de 60, inválido volta ao padrão", () => {
    const big = parseContactFilesParams(params("contactId=c1&limit=500"));
    expect("value" in big && big.value.limit).toBe(60);
    const bad = parseContactFilesParams(params("contactId=c1&limit=-3"));
    expect("value" in bad && bad.value.limit).toBe(CONTACT_MEDIA_PAGE);
  });
});

describe("readContactFilesPage", () => {
  it("lê itens, hasMore e a contagem", () => {
    expect(readContactFilesPage({ items: [{ id: "a" }], hasMore: true, unattachedCount: 7 })).toEqual({
      items: [{ id: "a" }], hasMore: true, unattachedCount: 7,
    });
  });

  it("contagem ausente ou inválida vira null", () => {
    expect(readContactFilesPage({ items: [], hasMore: false }).unattachedCount).toBeNull();
    expect(readContactFilesPage({ items: [], hasMore: false, unattachedCount: -1 }).unattachedCount).toBeNull();
  });

  it("formato errado LANÇA (o SWR guarda o erro e mantém a grade na tela)", () => {
    expect(() => readContactFilesPage({ error: "x" })).toThrow();
    expect(() => readContactFilesPage({ items: [], hasMore: "sim" })).toThrow();
    expect(() => readContactFilesPage(null)).toThrow();
  });
});

describe("paginação", () => {
  it("flattenPages junta as páginas sem repetir id", () => {
    const pages = [
      { items: [{ id: "c" }, { id: "b" }], hasMore: true, unattachedCount: 3 },
      { items: [{ id: "b" }, { id: "a" }], hasMore: false, unattachedCount: null },
    ];
    expect(flattenPages(pages).map((i) => i.id)).toEqual(["c", "b", "a"]);
    expect(flattenPages(undefined)).toEqual([]);
  });

  it("nextPageCursor = o último (mais antigo) da página; sem mais páginas = null", () => {
    const page = {
      items: [{ id: "m2", createdAt: "2026-09-24T10:00:00.000Z" }, { id: "m1", createdAt: "2026-09-23T10:00:00.000Z" }],
      hasMore: true,
    };
    expect(nextPageCursor(page)).toEqual({ before: "2026-09-23T10:00:00.000Z", beforeId: "m1" });
    expect(nextPageCursor({ ...page, hasMore: false })).toBeNull();
    expect(nextPageCursor({ items: [], hasMore: true })).toBeNull();
    expect(nextPageCursor(null)).toBeNull();
  });
});

describe("mergeNotes", () => {
  const history: ContactNoteItem[] = [
    { id: "n3", body: "versão velha", authorId: "u1", authorName: "Ana", sentByBot: false, createdAt: "2026-09-24T12:00:00.000Z" },
    { id: "n2", body: "apagada depois", authorId: "u1", authorName: "Ana", sentByBot: false, createdAt: "2026-09-10T12:00:00.000Z" },
    { id: "n1", body: "transferi: lead quer falar com humano", authorId: null, authorName: "Bot", sentByBot: true, createdAt: "2026-08-01T12:00:00.000Z" },
  ];
  const windowMessages = [
    { id: "x1", internal: false, body: "oi", createdAt: "2026-09-24T11:00:00.000Z" },
    { id: "n3", internal: true, body: "versão editada", authorName: "Ana", createdAt: "2026-09-24T12:00:00.000Z" },
    { id: "n2", internal: true, body: "apagada depois", createdAt: "2026-09-10T12:00:00.000Z", deletedAt: "2026-09-25T00:00:00.000Z" },
    { id: "n4", internal: true, body: "nota nova", authorName: "Bia", createdAt: "2026-09-25T09:00:00.000Z" },
  ];

  it("junta janela + histórico, a mais nova primeiro, sem mensagem comum", () => {
    expect(mergeNotes(windowMessages, history).map((n) => n.id)).toEqual(["n4", "n3", "n1"]);
  });

  it("mesmo id: vale a da thread (viva); apagada na thread some do histórico", () => {
    const merged = mergeNotes(windowMessages, history);
    expect(merged.find((n) => n.id === "n3")?.body).toBe("versão editada");
    expect(merged.some((n) => n.id === "n2")).toBe(false);
  });

  it("sem histórico = só a janela", () => {
    expect(mergeNotes(windowMessages, undefined).map((n) => n.id)).toEqual(["n4", "n3"]);
  });

  it("latestBotNote acha a nota do bot mais recente com texto", () => {
    const merged = mergeNotes(windowMessages, history);
    expect(latestBotNote(merged)?.id).toBe("n1");
    expect(latestBotNote(mergeNotes(windowMessages, undefined))).toBeNull();
    expect(latestBotNote([{ sentByBot: true, body: "   " }])).toBeNull();
  });
});

describe("latestMediaMessageId", () => {
  it("última mídia da janela, sem otimista nem apagada", () => {
    const msgs = [
      { id: "a", mediaKey: "whatsapp/c/1-midia.jpeg", createdAt: "1" },
      { id: "b", mediaKey: "whatsapp/c/2-midia.jpeg", createdAt: "2", deletedAt: "3" },
      { id: "temp-1", mediaKey: "whatsapp/c/out-3-foto.jpeg", createdAt: "3" },
      { id: "c", mediaKey: null, createdAt: "4" },
    ];
    expect(latestMediaMessageId(msgs)).toBe("a");
    expect(latestMediaMessageId([])).toBeNull();
  });
});

describe("limites e pastas", () => {
  it("teto do lote e pasta válida", () => {
    expect(ATTACH_BATCH_MAX).toBe(50);
    expect(isDocumentCategory("IDENTIFICACAO")).toBe(true);
    expect(isDocumentCategory("identificacao")).toBe(false);
    expect(isDocumentCategory(undefined)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  inboxListState,
  manualUnreadPatch,
  mediaTypeLabel,
  patchConversationList,
  patchConversationRow,
  readPatch,
  revertPatch,
  sameTags,
  withTag,
} from "@/app/_shared/utils/whatsapp-inbox";

// Regras puras da lista do inbox: a prévia da última mensagem sai do servidor
// (loadConversations) e, nas ações com patch local, do próprio navegador. As
// duas usam as mesmas funções para a linha não "pular" quando o hash recarrega.

describe("mediaTypeLabel", () => {
  it("dá o nome curto de cada tipo de mídia", () => {
    expect(mediaTypeLabel("image/jpeg")).toBe("Foto");
    expect(mediaTypeLabel("image/webp")).toBe("Foto");
    expect(mediaTypeLabel("video/mp4")).toBe("Vídeo");
    expect(mediaTypeLabel("audio/ogg")).toBe("Áudio");
    expect(mediaTypeLabel("audio/ogg; codecs=opus")).toBe("Áudio");
  });

  it("qualquer outro tipo vira Documento", () => {
    expect(mediaTypeLabel("application/pdf")).toBe("Documento");
    expect(mediaTypeLabel("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("Documento");
    expect(mediaTypeLabel("")).toBe("Documento");
  });
});

// Tag otimista (auditoria de 24/09/2026): o 2º clique desfazia a tag e o chip
// só aparecia depois de recarregar a lista inteira.
const VIP = { id: "t1", name: "VIP", color: "#111111" };
const URG = { id: "t2", name: "Urgente", color: "#222222" };
const CONTR = { id: "t3", name: "Contratados", color: "#333333" };

describe("withTag", () => {
  it("ligar duas vezes a mesma tag deixa uma só", () => {
    const once = withTag([URG], VIP, true);
    const twice = withTag(once, VIP, true);
    expect(twice.map((t) => t.id)).toEqual(["t2", "t1"]);
    expect(twice).toBe(once);
  });

  it("desligar tag ausente não muda nada (mesma referência)", () => {
    const tags = [URG, CONTR];
    expect(withTag(tags, VIP, false)).toBe(tags);
  });

  it("preserva a ordem das outras tags e não muta a entrada", () => {
    const tags = [URG, VIP, CONTR];
    const out = withTag(tags, VIP, false);
    expect(out.map((t) => t.id)).toEqual(["t2", "t3"]);
    expect(tags.map((t) => t.id)).toEqual(["t2", "t1", "t3"]);
    expect(withTag(out, VIP, true).map((t) => t.id)).toEqual(["t2", "t3", "t1"]);
  });
});

type Row = { contactId: string; lastMessageAt: string; tags: typeof VIP[]; status: string };
const row = (contactId: string, lastMessageAt: string, extra: Partial<Row> = {}): Row => ({
  contactId, lastMessageAt, tags: [], status: "human", ...extra,
});

describe("patchConversationList", () => {
  const list = [
    row("a", "2026-09-25T12:00:00.000Z"),
    row("b", "2026-09-25T11:00:00.000Z"),
    row("c", "2026-09-25T10:00:00.000Z"),
  ];

  it("contato fora da lista devolve a MESMA referência", () => {
    expect(patchConversationList(list, "zzz", { status: "closed" })).toBe(list);
  });

  it("lista ainda não carregada continua undefined", () => {
    expect(patchConversationList(undefined as Row[] | undefined, "a", { status: "closed" })).toBeUndefined();
  });

  it("aplica o patch só na conversa certa, sem mutar a entrada", () => {
    const snapshot = JSON.stringify(list);
    const out = patchConversationList(list, "b", { tags: [VIP] });
    expect(out).not.toBe(list);
    expect(out[1].tags).toEqual([VIP]);
    expect(out[0]).toBe(list[0]);
    expect(out[2]).toBe(list[2]);
    expect(JSON.stringify(list)).toBe(snapshot);
  });

  it("patch em função parte da versão atual da conversa", () => {
    const withUrg = patchConversationList(list, "c", (c) => ({ tags: withTag(c.tags, URG, true) }));
    const both = patchConversationList(withUrg, "c", (c) => ({ tags: withTag(c.tags, VIP, true) }));
    expect(both[2].tags.map((t) => t.id)).toEqual(["t2", "t1"]);
  });

  it("patch que não muda nada devolve a mesma referência", () => {
    const tagged = patchConversationList(list, "a", { tags: [VIP] });
    expect(patchConversationList(tagged, "a", (c) => ({ tags: withTag(c.tags, VIP, true) }))).toBe(tagged);
  });

  it("mudar lastMessageAt reposiciona por atividade (desc), mantendo a ordem das outras", () => {
    const out = patchConversationList(list, "c", { lastMessageAt: "2026-09-25T13:00:00.000Z" });
    expect(out.map((c) => c.contactId)).toEqual(["c", "a", "b"]);
    const down = patchConversationList(list, "a", { lastMessageAt: "2026-09-25T09:00:00.000Z" });
    expect(down.map((c) => c.contactId)).toEqual(["b", "c", "a"]);
  });
});

describe("sameTags", () => {
  it("compara id, nome, cor e ordem", () => {
    expect(sameTags([URG, VIP], [{ ...URG }, { ...VIP }])).toBe(true);
    expect(sameTags([URG, VIP], [VIP, URG])).toBe(false);
    expect(sameTags([URG], [{ ...URG, color: "#000000" }])).toBe(false);
    expect(sameTags([URG], [URG, VIP])).toBe(false);
  });
});

describe("patchConversationRow", () => {
  it("devolve a mesma linha quando os valores são iguais", () => {
    const r = row("a", "2026-09-25T12:00:00.000Z");
    expect(patchConversationRow(r, { status: "human" })).toBe(r);
    expect(patchConversationRow(r, { status: "closed" })).toEqual({ ...r, status: "closed" });
  });
});

describe("revertPatch", () => {
  it("devolve os valores originais só das chaves do patch", () => {
    const original = row("a", "2026-09-25T12:00:00.000Z", { tags: [URG], status: "queued" });
    const rollback = revertPatch(original, { status: "human", tags: [URG, VIP] });
    expect(rollback).toEqual({ status: "queued", tags: [URG] });
    expect(Object.keys(rollback).sort()).toEqual(["status", "tags"]);
  });
});

// Leitura sem recarregar a lista (auditoria de 24/09/2026): abrir a conversa
// zera o badge por patch local e o markRead não dispara mais a recarga.
describe("readPatch / manualUnreadPatch", () => {
  type ReadRow = {
    contactId: string; lastMessageAt: string; unread: boolean; unreadCount: number;
    manualUnread: boolean; lastReadAt: string | null; status: string;
  };
  const naoLida: ReadRow = {
    contactId: "a", lastMessageAt: "2026-09-25T12:00:00.000Z", unread: true, unreadCount: 4,
    manualUnread: false, lastReadAt: null, status: "queued",
  };

  it("readPatch zera unreadCount/manualUnread e grava lastReadAt", () => {
    const p = readPatch("2026-09-25T12:30:00.000Z");
    expect(p).toEqual({ unread: false, unreadCount: 0, manualUnread: false, lastReadAt: "2026-09-25T12:30:00.000Z" });
    const out = patchConversationRow(naoLida, p);
    expect(out).toEqual({ ...naoLida, ...p });
    // Não mexe na posição da conversa nem no resto da linha.
    expect(out.lastMessageAt).toBe(naoLida.lastMessageAt);
    expect(out.status).toBe("queued");
  });

  it("readPatch tira o marcador de 'Marcar como não lida'", () => {
    const manual = patchConversationRow(naoLida, manualUnreadPatch());
    expect(manual.manualUnread).toBe(true);
    expect(patchConversationRow(manual, readPatch("2026-09-25T13:00:00.000Z")).manualUnread).toBe(false);
  });

  it("manualUnreadPatch grava a sentinela da época, como o servidor", () => {
    expect(manualUnreadPatch()).toEqual({ unread: true, manualUnread: true, lastReadAt: "1970-01-01T00:00:00.000Z" });
  });

  it("rollback do 'Marcar como não lida' volta exatamente à linha original", () => {
    const optimistic = manualUnreadPatch();
    const lida = patchConversationRow(naoLida, readPatch("2026-09-25T12:30:00.000Z"));
    const apos = patchConversationRow(lida, optimistic);
    expect(patchConversationRow(apos, revertPatch(lida, optimistic))).toEqual(lida);
  });
});

describe("inboxListState", () => {
  const base = { loaded: false, isLoading: false, hasError: false, count: 0 };

  it("1ª carga em voo mostra o esqueleto, nunca 'Nenhuma conversa ainda'", () => {
    expect(inboxListState({ ...base, isLoading: true })).toBe("loading");
  });

  it("'vazia' só com a lista carregada e sem nenhuma conversa", () => {
    expect(inboxListState({ ...base, loaded: true })).toBe("empty");
    expect(inboxListState({ ...base, loaded: true, count: 3 })).toBe("ready");
  });

  it("falha sem lista vira erro (o esqueleto não fica girando para sempre)", () => {
    // shouldRetryOnError:false → data undefined e isLoading false depois da falha
    expect(inboxListState({ ...base, hasError: true })).toBe("error");
  });

  it("'Tentar novamente' em voo volta ao esqueleto mesmo com o erro anterior", () => {
    expect(inboxListState({ ...base, hasError: true, isLoading: true })).toBe("loading");
  });

  it("falha de recarga com lista antiga na tela não apaga a lista", () => {
    expect(inboxListState({ ...base, loaded: true, hasError: true, count: 5 })).toBe("ready");
  });

  it("resultado da busca no servidor aparece mesmo sem a carga principal", () => {
    expect(inboxListState({ ...base, hasError: true, searchHits: 2 })).toBe("ready");
    expect(inboxListState({ ...base, isLoading: true, searchHits: 1 })).toBe("ready");
  });

  it("sem carga, sem erro e sem voo (1ª carga descartada por um patch) conta como carregando", () => {
    expect(inboxListState(base)).toBe("loading");
  });
});

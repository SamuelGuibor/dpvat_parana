import { describe, expect, it } from "vitest";
import type { WhatsAppThreadMessage } from "@/app/_shared/hooks/use-whatsapp";
import {
  mergeThreadWindow,
  toThreadMessage,
  unionThreadMessages,
  upsertById,
  type SentMessageDTO,
} from "@/app/_shared/utils/thread-window";

// Janela da thread do inbox (auditoria de 24/09/2026): THR-5 (mensagem do meio
// some depois de "Carregar anteriores") e THR-10 (bolha enviada pisca).

const BASE = Date.parse("2026-09-20T12:00:00.000Z");

/** Mensagem com createdAt = BASE + `sec` segundos. */
function m(id: string, sec: number, extra: Partial<WhatsAppThreadMessage> = {}): WhatsAppThreadMessage {
  return {
    id,
    contactId: "c1",
    direction: "in",
    body: id,
    mediaKey: null,
    mediaType: null,
    status: "delivered",
    sentByBot: false,
    authorId: null,
    authorName: null,
    internal: false,
    createdAt: new Date(BASE + sec * 1000).toISOString(),
    ...extra,
  };
}

/** Todas as mensagens da conversa, em ordem: T0..T(n-1). */
function timeline(n: number): WhatsAppThreadMessage[] {
  return Array.from({ length: n }, (_, i) => m(`T${i}`, i));
}

/** Janela "recent" do servidor: as 50 mais novas de `all`, em ordem. */
function serverWindow(all: WhatsAppThreadMessage[], size = 50): WhatsAppThreadMessage[] {
  return all.slice(Math.max(0, all.length - size));
}

const ids = (list: WhatsAppThreadMessage[]) => list.map((x) => x.id);

describe("mergeThreadWindow", () => {
  it("cenário do bug: R0..R49 → R1..R49,N com older preenchido — R0 vai para o older", () => {
    const all = timeline(80); // T0..T79
    const older = all.slice(0, 30); // bloco de "Carregar anteriores": T0..T29
    const prev = all.slice(30, 80); // R0..R49 = T30..T79
    const withNew = [...all, m("N", 1000)];
    const next = serverWindow(withNew); // T31..T79,N

    const nextOlder = mergeThreadWindow(older, prev, next);
    expect(ids(nextOlder)).toEqual(ids(all.slice(0, 31))); // T0..T30
    const shown = unionThreadMessages(nextOlder, next);
    expect(ids(shown)).toEqual(ids(withNew));
  });

  it("janela deslizando 3 vezes com older preenchido não perde nem duplica nada", () => {
    let all = timeline(80);
    let older = all.slice(0, 30);
    let recent = serverWindow(all);
    for (let k = 0; k < 3; k++) {
      all = [...all, m(`N${k}`, 1000 + k)];
      const next = serverWindow(all);
      older = mergeThreadWindow(older, recent, next);
      recent = next;
      const shown = unionThreadMessages(older, recent);
      expect(ids(shown)).toEqual(ids(all));
      expect(new Set(ids(shown)).size).toBe(shown.length);
    }
  });

  it("janela que desliza mais de 1 por vez (3 mensagens num poll só)", () => {
    const all = timeline(80);
    const older = all.slice(0, 30);
    const prev = serverWindow(all);
    const withNew = [...all, m("N1", 1000), m("N2", 1001), m("N3", 1002)];
    const next = serverWindow(withNew);

    const nextOlder = mergeThreadWindow(older, prev, next);
    expect(ids(unionThreadMessages(nextOlder, next))).toEqual(ids(withNew));
  });

  it("tolera recent com 51 itens (mensagem enviada entrou no cache antes do poll)", () => {
    const all = timeline(80);
    const older = all.slice(0, 30);
    const sent = m("S", 1000, { direction: "out" });
    const prev = [...serverWindow(all), sent]; // 51 itens
    const next = serverWindow([...all, sent]); // o servidor devolve 50: T31..T79,S

    const nextOlder = mergeThreadWindow(older, prev, next);
    expect(ids(unionThreadMessages(nextOlder, next))).toEqual(ids([...all, sent]));
  });

  it("com older vazio (histórico fechado), devolve o older inalterado", () => {
    const all = timeline(60);
    const older: WhatsAppThreadMessage[] = [];
    const prev = serverWindow(all);
    const next = serverWindow([...all, m("N", 1000)]);
    expect(mergeThreadWindow(older, prev, next)).toBe(older);
  });

  it("clique em voo (historyOpen) com older ainda vazio já guarda o que deslizou", () => {
    const all = timeline(60);
    const prev = serverWindow(all); // T10..T59
    const next = serverWindow([...all, m("N", 1000)]); // T11..T59,N
    expect(ids(mergeThreadWindow([], prev, next, { historyOpen: true }))).toEqual(["T10"]);
  });

  it("sem mudança na janela, devolve o mesmo older", () => {
    const all = timeline(80);
    const older = all.slice(0, 30);
    const prev = serverWindow(all);
    expect(mergeThreadWindow(older, prev, [...prev])).toBe(older);
  });

  it("mensagem que sumiu do recent mas é mais nova que o início dele não volta (apagada no banco)", () => {
    const all = timeline(80);
    const older = all.slice(0, 30);
    const prev = serverWindow(all); // T30..T79
    const next = prev.filter((x) => x.id !== "T60"); // T60 apagada
    expect(mergeThreadWindow(older, prev, next)).toBe(older);
  });

  it("recent vazio (poll com erro) com histórico aberto guarda tudo; na volta não duplica", () => {
    const all = timeline(80);
    const older = all.slice(0, 30);
    const prev = serverWindow(all);
    const kept = mergeThreadWindow(older, prev, []);
    expect(ids(unionThreadMessages(kept, []))).toEqual(ids(all));

    const back = serverWindow(all);
    const olderAfter = mergeThreadWindow(kept, [], back);
    const shown = unionThreadMessages(olderAfter, back);
    expect(ids(shown)).toEqual(ids(all));
  });

  it("a versão deslocada (mais nova) substitui a cópia velha que já estava no older", () => {
    const stale = m("T30", 30, { body: "antes" });
    const older = [...timeline(30), stale];
    const prev = [m("T30", 30, { body: "editada" }), m("T31", 31)];
    const next = [m("T31", 31), m("N", 1000)];
    const nextOlder = mergeThreadWindow(older, prev, next);
    expect(nextOlder.filter((x) => x.id === "T30")).toHaveLength(1);
    expect(nextOlder.find((x) => x.id === "T30")?.body).toBe("editada");
  });
});

describe("unionThreadMessages", () => {
  it("sem older devolve o próprio recent (mesma referência)", () => {
    const recent = timeline(5);
    expect(unionThreadMessages([], recent)).toBe(recent);
  });

  it("não repete id e fica com a versão do recent", () => {
    const older = [m("A", 1), m("B", 2, { body: "velha" })];
    const recent = [m("B", 2, { body: "nova" }), m("C", 3)];
    const out = unionThreadMessages(older, recent);
    expect(ids(out)).toEqual(["A", "B", "C"]);
    expect(out[1].body).toBe("nova");
  });
});

describe("upsertById", () => {
  it("id novo entra no fim (mensagem enviada é a mais nova)", () => {
    const data = timeline(3);
    const out = upsertById(data, m("S", 100));
    expect(ids(out)).toEqual(["T0", "T1", "T2", "S"]);
    expect(data).toHaveLength(3); // não muta a lista de entrada
  });

  it("id que já existe (o poll/SSE chegou antes) é substituído no lugar, sem duplicar", () => {
    const fromServer = m("S", 1, {
      status: "delivered", mediaUrl: "https://s3/x", mediaUrlExpiresAt: "2026-09-20T13:00:00.000Z",
      transcript: "oi", waMessageId: "wamid.1",
    });
    const data = [m("T0", 0), fromServer, m("T2", 2)];
    const fromAction = m("S", 1, { status: "sent", body: "texto" });
    delete fromAction.mediaUrl;
    delete fromAction.transcript;
    delete fromAction.waMessageId;

    const out = upsertById(data, fromAction);
    expect(ids(out)).toEqual(["T0", "S", "T2"]);
    expect(out[1].status).toBe("sent");
    // Campo que a action não traz não apaga o que o servidor já mandou.
    expect(out[1].mediaUrl).toBe("https://s3/x");
    expect(out[1].transcript).toBe("oi");
    expect(out[1].waMessageId).toBe("wamid.1");
  });

  it("id novo mais antigo que a última da lista entra na posição do createdAt", () => {
    const data = [m("T0", 0), m("IN", 10)];
    expect(ids(upsertById(data, m("S", 5)))).toEqual(["T0", "S", "IN"]);
  });
});

describe("toThreadMessage", () => {
  const dto: SentMessageDTO = {
    id: "msg1",
    channelId: "whatsapp:c1",
    contactId: "c1",
    direction: "out",
    body: "olá",
    mediaKey: null,
    mediaType: null,
    status: "sent",
    sentByBot: false,
    authorId: "u1",
    createdAt: "2026-09-20T12:00:00.000Z",
    contactName: "Cliente",
    contactPhone: "5541999999999",
    conversationStatus: "human",
    replyToId: "r1",
    replyToBody: "pergunta",
    replyToDirection: "in",
  };

  it("mapeia o DTO para a thread (humana, não interna, com o nome do autor)", () => {
    const out = toThreadMessage(dto, "Atendente");
    expect(out).toMatchObject({
      id: "msg1", contactId: "c1", direction: "out", body: "olá", status: "sent",
      authorId: "u1", authorName: "Atendente", internal: false, sentByBot: false,
      createdAt: dto.createdAt, replyToId: "r1", replyToBody: "pergunta", replyToDirection: "in",
    });
    // O DTO não traz: fica undefined para o upsert não apagar o do servidor.
    expect(out.transcript).toBeUndefined();
    expect(out.reaction).toBeUndefined();
    expect(out.mediaUrl).toBeUndefined();
  });

  it("copia a URL assinada da mídia quando a action manda", () => {
    const out = toThreadMessage(
      { ...dto, mediaKey: "whatsapp/c1/1-foto.jpg", mediaType: "image/jpeg", mediaUrl: "https://s3/y", mediaUrlExpiresAt: "2026-09-20T13:00:00.000Z" },
      "Atendente",
    );
    expect(out.mediaUrl).toBe("https://s3/y");
    expect(out.mediaUrlExpiresAt).toBe("2026-09-20T13:00:00.000Z");
  });
});
